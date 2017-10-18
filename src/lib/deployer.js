"use strict";

const _ = require("lodash");
const fs = require("fs");
const path = require("path");
const glob = require("glob");
const yaml = require("js-yaml");
const Kubectl = require("./kubectl");
const Promise = require("bluebird");
const EventEmitter = require("events");
const Manifests = require("./manifests");
const Namespaces = require("./namespaces");
const Progress = require("./progress");
const Webhook = require("./webhook");
const readFileAsync = Promise.promisify(fs.readFile);
const Strategies = require("./strategy").Strategies;

class Deployer extends EventEmitter {
  constructor(options) {
    super();
    this.options = _.merge(
      {
        apiVersion: "v1",
        uuid: null,
        deployId: null,
        strategyName: Strategies.RollingUpdate,
        resource: null,
        sha: undefined,
        selector: undefined,
        dryRun: true,
        isRollback: false,
        debug: false,
        diff: false,
        force: false,
        available: {
          enabled: false,
          all: false,
          webhooks: [],
          pollingInterval: 10,
          healthCheck: true,
          healthCheckGracePeriod: undefined,
          healthCheckThreshold: undefined,
          keepAlive: false,
          keepAliveInterval: 30,
          required: false,
          timeout: 10 * 60 // 10 minutes
        },
        dependency: {
          wait: 3, // 3 seconds
          timeout: 10 * 60 // 10 minutes
        },
        github: {
          enabled: true,
          token: undefined,
          user: undefined,
          repo: undefined
        },
        backup: {
          enabled: false,
          bucket: undefined,
          saveFormat: undefined
        },
        elroy: {
          enabled: false,
          url: undefined,
          secret: undefined
        }
      },
      options
    );
  }

  deploy(configPattern, manifestsDir, namespacesDir) {
    var self = this;
    return new Promise(function(resolve, reject) {
      const progress = new Progress();
      let clusterGeneratedManifests = [];
      progress.on("progress", msg => {
        self.emit("progress", msg);
      });

      glob(configPattern, (globErr, configFiles) => {
        if (globErr) {
          return reject(globErr);
        }

        let webhook = undefined;
        var errors = [];
        var promises = [];

        if (!configFiles.length) {
          self.emit(
            "warn",
            "No config files found using pattern: " + configPattern
          );
          return resolve();
        }

        if (self.options.available.webhooks.length) {
          webhook = new Webhook({
            uuid: self.options.uuid,
            urls: self.options.available.webhooks,
            isRollback: self.options.isRollback
          });
          webhook.on("debug", msg => {
            self.emit("debug", msg);
          });
          webhook.on("info", msg => {
            self.emit("info", msg);
          });
          webhook.on("error", msg => {
            self.emit("error", msg);
          });
        }

        var readPromises = [];
        _.each(configFiles, function(configFile) {
          readPromises.push(
            readFileAsync(configFile, "utf8").then(rawContent => {
              // Parse the cluster yaml file to JSON
              var config = yaml.safeLoad(rawContent);

              function clusterDebug(message) {
                self.emit("debug", config.metadata.name + " - " + message);
              }

              function clusterLog(message) {
                self.emit("info", config.metadata.name + " - " + message);
              }

              function clusterError(message) {
                const msg = config.metadata.name + " - " + message;
                self.emit("error", msg);
                return msg;
              }

              function clusterWarning(message) {
                self.emit("warn", config.metadata.name + " - " + message);
              }

              // Verify is correct kind
              if (config.kind != "Config") {
                self.emit(
                  "fatal",
                  "Expected kind: 'Config', found kind: '" + config.kind + "'"
                );
                return reject();
              } else if (!config.metadata || !config.metadata.name) {
                self.emit(
                  "fatal",
                  "Missing required 'metadata.name' property for " + configFile
                );
                return reject();
              }

              // Add each cluster so we know the total number of clusters that need to be processed
              progress.add(config.metadata.name);

              var kubectl = new Kubectl({
                dryRun: self.options.dryRun,
                cwd: path.dirname(configFile),
                kubeconfig: config,
                kubeconfigFile: configFile
              });
              kubectl.on("info", msg => {
                self.emit("info", msg);
              });
              kubectl.on("warn", msg => {
                self.emit("warn", msg);
              });
              kubectl.on("spawn", args => {
                self.emit("spawn", args);
              });
              kubectl.on("request", args => {
                self.emit("request", args);
              });

              // Create namespaces before deploying any manifests
              var namespaces = new Namespaces({
                clusterName: config.metadata.name,
                dir: namespacesDir,
                kubectl: kubectl
              });
              namespaces.on("debug", clusterDebug);
              namespaces.on("info", clusterLog);
              namespaces.on("error", clusterError);
              promises.push(
                namespaces.deploy().then(function() {
                  var manifests = new Manifests({
                    uuid: self.options.uuid,
                    deployId: self.options.deployId,
                    strategyName: self.options.strategyName,
                    resource: self.options.resource,
                    isRollback: self.options.isRollback,
                    sha: self.options.sha,
                    cluster: config,
                    dir: manifestsDir,
                    selector: self.options.selector,
                    github: self.options.github,
                    dependency: self.options.dependency,
                    dryRun: self.options.dryRun,
                    available: self.options.available,
                    diff: self.options.diff,
                    force: self.options.force,
                    backup: self.options.backup,
                    elroy: self.options.elroy,
                    kubectl: kubectl
                  });
                  manifests.on("status", status => {
                    self.emit("status", status);
                    if (webhook) {
                      try {
                        // Add the progress to the status before sending webhook
                        status.progress = progress.status();
                        webhook.change(status);
                      } catch (err) {
                        clusterError(err);
                        errors.push(err);
                      }
                    }
                  });
                  manifests.on("debug", clusterDebug);
                  manifests.on("info", clusterLog);
                  manifests.on("warn", clusterWarning);
                  manifests.on("error", msg => {
                    const msgWithCluster = clusterError(msg);
                    errors.push(msgWithCluster);
                  });
                  return manifests
                    .deploy()
                    .then(res => {
                      progress.success(config.metadata.name);
                      return res;
                    })
                    .catch(err => {
                      progress.fail(config.metadata.name);
                      throw err;
                    });
                })
              );
            })
          );
        });

        Promise.all(readPromises)
          .then(() => {
            return Promise.all(promises);
          })
          .then(res => {
            clusterGeneratedManifests = res;
            // If a webhook is set and available is required, only resolve once the webhook has finished
            if (
              webhook &&
              self.options.available.enabled &&
              self.options.available.required
            ) {
              return webhook.sent();
            }
            return null;
          })
          .catch(function(err) {
            self.emit("error", err);
            errors.push(err);
          })
          .finally(function() {
            if (self.options.dryRun) {
              self.emit(
                "info",
                "This was a dry run and no changes were deployed"
              );
            }
            if (errors.length) {
              self.emit(
                "error",
                errors.length + " errors occurred, rejecting with first error"
              );
              return reject(errors.join(", "));
            }
            self.emit("info", "Finished successfully");
            return resolve(clusterGeneratedManifests);
          })
          .done();
      });
    });
  }
}

module.exports = Deployer;
