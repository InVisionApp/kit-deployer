"use strict";

const _ = require("lodash");
const manifestDiff = require("../util/manifest-diff");
const fs = require("fs");
const glob = require("glob");
const Github = require("./github");
const Promise = require("bluebird");
const path = require("path");
const yaml = require("js-yaml");
const EventEmitter = require("events");
const Dependencies = require("./dependencies");
const Status = require("./status");
const matchSelector = require("../util/match-selector");
const writeFileAsync = Promise.promisify(fs.writeFile);
const readFileAsync = Promise.promisify(fs.readFile);
const uuid = require("uuid");
const mkdirp = Promise.promisify(require("mkdirp"));
const Annotator = require("./annotator/annotator");
const Annotations = require("./annotator/annotations");
const Backup = require("./backup");
const Elroy = require("./elroy").Elroy;
const Strategies = require("./strategy").Strategies;
const Strategy = require("./strategy").Strategy;
const mustBeRecreated = ["Job"];

class Manifests extends EventEmitter {
  constructor(options) {
    super();
    this.options = _.merge(
      {
        uuid: null,
        deployId: undefined,
        strategyName: Strategies.RollingUpdate,
        resource: null,
        isRollback: false,
        sha: undefined,
        waitForAvailable: false,
        cluster: undefined,
        dir: undefined,
        selector: undefined,
        force: false,
        createOnly: false,
        raw: false,
        watcherUpdateBlacklist: [],
        dryRun: false,
        available: {
          enabled: false,
          all: false,
          healthCheck: true,
          healthCheckGracePeriod: undefined,
          healthCheckIgnoredErrors: [],
          keepAlive: false,
          keepAliveInterval: 30,
          required: false,
          timeout: 10 * 60 // 10 minutes
        },
        github: {
          enabled: true,
          token: undefined,
          user: undefined,
          repo: undefined
        },
        dependency: {
          wait: 3, // 3 seconds
          timeout: 10 * 60 // 10 minutes
        },
        backup: {
          enabled: false,
          bucket: "kit-manifest-backup",
          saveFormat: "yaml"
        },
        elroy: {
          enabled: false,
          url: undefined,
          secret: undefined
        },
        kubectl: undefined
      },
      options
    );
    this.kubectl = this.options.kubectl;
    this.emit("info", `Using '${this.options.strategyName}' strategy`);
    this.strategy = new Strategy(this.options.strategyName, this.options);
    this.strategy.on("info", msg => {
      this.emit("info", msg);
    });
  }

  /**
   * Returns whether or not the manifests includes a k8s resource in the elroy watcher update blacklist
   * @param {array} generatedManifests - an array of manifests to check
   * @return {boolean} - whether or not these manifests contain a blacklisted resource
   */
  inWatcherUpdateBlacklist(generatedManifests) {
    for (let manifest of generatedManifests) {
      if (
        manifest.kind &&
        this.options.watcherUpdateBlacklist.includes(manifest.kind)
      ) {
        return true;
      }
    }
    return false;
  }

  load() {
    return new Promise((resolve, reject) => {
      this.manifestFiles = [];
      if (!this.options.dir) {
        return this.manifestFiles;
      }
      // validate directory, if it doesnt exist, skip processing.
      //
      glob(
        path.join(
          this.options.dir,
          this.options.cluster.metadata.name + "/**/*.yaml"
        ),
        (err, files) => {
          if (err) {
            return reject(err);
          }
          var readPromises = [];
          _.each(files, file => {
            // only add file if it matches selector
            readPromises.push(
              readFileAsync(file, "utf8").then(rawContent => {
                const content = yaml.safeLoad(rawContent);
                let labels;
                if (_.has(content, ["metadata", "labels"])) {
                  labels = content.metadata.labels;
                }
                if (matchSelector(labels, this.options.selector)) {
                  this.manifestFiles.push({
                    path: file,
                    content: content
                  });
                } else {
                  this.emit(
                    "info",
                    `Skipping ${content.metadata
                      .name} because it does not match selector ${this.options
                      .selector}`
                  );
                }
              })
            );
          });
          return Promise.all(readPromises)
            .then(() => {
              resolve();
            })
            .catch(allErr => {
              reject(allErr);
            });
        }
      );
      return null;
    });
  }

  // We only want to query for kinds that we are deploying
  list() {
    var listTypes = [];
    _.each(this.manifestFiles, manifestFile => {
      var manifest = manifestFile.content;
      var kind = manifest.kind.toLowerCase();
      if (listTypes.indexOf(kind) < 0) {
        listTypes.push(kind);
      }
    });

    if (listTypes.length) {
      // Sort alpha to make the ordering predictable
      listTypes.sort();

      if (this.options.selector) {
        this.emit(
          "info",
          "Getting list of " +
            listTypes.join(",") +
            " matching '" +
            this.options.selector +
            "'"
        );
      } else {
        this.emit("info", "Getting list of " + listTypes.join(","));
      }
      return this.kubectl.list(listTypes.join(","), this.options.selector);
    } else {
      this.emit("warn", "No supported manifests found");
      return Promise.resolve({
        items: []
      });
    }
  }

  /**
	 * Deploys the manifests to the cluster.
	 * @fires Manifests#info
	 * @fires Manifests#warning
	 * @fires Manifests#error
	 * @return {object} promise
	 */
  deploy() {
    return new Promise((resolve, reject) => {
      const tmpDir = path.join(
        "/tmp/kit-deployer",
        `${this.options.uuid}_${uuid.v4()}`
      );
      var generatedManifests = [];
      var availablePromises = [];
      var dependencies = new Dependencies({
        kubectl: this.kubectl
      });
      dependencies.on("debug", msg => {
        this.emit("debug", msg);
      });
      dependencies.on("info", msg => {
        this.emit("info", msg);
      });
      dependencies.wait = parseInt(this.options.dependency.wait);
      dependencies.timeout = parseInt(this.options.dependency.timeout);

      var status = new Status({
        dryRun: this.options.dryRun,
        pollingInterval: this.options.available.pollingInterval,
        healthCheck: this.options.available.healthCheck,
        healthCheckGracePeriod: this.options.available.healthCheckGracePeriod,
        healthCheckThreshold: this.options.available.healthCheckThreshold,
        healthCheckIgnoredErrors: this.options.available
          .healthCheckIgnoredErrors,
        keepAlive: this.options.available.keepAlive,
        keepAliveInterval: this.options.available.keepAliveInterval,
        timeout: this.options.available.timeout,
        kubectl: this.kubectl
      });
      status.on("debug", msg => {
        this.emit("debug", msg);
      });
      status.on("info", msg => {
        this.emit("info", msg);
      });
      status.on("error", err => {
        this.emit("error", err);
      });

      this.emit("status", {
        name: this.options.cluster.metadata.name,
        kind: "Cluster",
        phase: "STARTED",
        status: "IN_PROGRESS",
        manifest: this.options.cluster
      });

      var existing = [];

      // Backup
      const backup = new Backup(
        this.options.backup.enabled,
        this.options.backup.bucket,
        this.options.backup.saveFormat,
        this.options.dryRun
      );
      backup.on("info", msg => {
        this.emit("info", msg);
      });
      backup.on("debug", msg => {
        this.emit("debug", msg);
      });
      backup.on("warn", err => {
        this.emit("warn", err);
      });

      // Elroy
      const elroy = new Elroy(
        _.merge(this.options.elroy, {
          uuid: this.options.uuid,
          isRollback: this.options.isRollback,
          clusterName: this.options.cluster.metadata.name,
          resource: this.options.resource,
          dryRun: this.options.dryRun
        })
      );
      elroy.on("info", msg => {
        this.emit("info", msg);
      });
      elroy.on("debug", msg => {
        this.emit("debug", msg);
      });
      elroy.on("warn", err => {
        this.emit("warn", err);
      });

      // Annotator
      const annotator = new Annotator({
        uuid: this.options.uuid,
        sha: this.options.sha,
        strategy: this.strategy,
        deployId: this.options.deployId,
        raw: this.options.raw
      });

      return this.load()
        .then(() => {
          // There are no files to process, skip cluster to prevent needless querying of resources on the cluster
          if (
            Array.isArray(this.manifestFiles) &&
            this.manifestFiles.length === 0
          ) {
            this.emit(
              "debug",
              "No cluster files to processs, skipping " +
                this.options.cluster.metadata.name
            );
            return true;
          }
          // There are files to process, so let's get the list of current resources on the cluster
          return this.list()
            .then(results => {
              this.emit("info", "Found " + results.items.length + " resources");
              existing = results.items;
            })
            .then(() => {
              this.emit("debug", "Generating tmp directory: " + tmpDir);
              return mkdirp(tmpDir);
            })
            .then(() => {
              // We are not skipping this cluster
              return false;
            });
        })
        .then(skip => {
          if (skip) {
            return Promise.resolve();
          }

          var kubePromises = [];
          var promiseFuncsWithDependencies = [];
          var remaining = _.cloneDeep(existing);
          _.each(this.manifestFiles, manifestFile => {
            var manifest = manifestFile.content;

            // Annotator will add required annotations and rename the manifest if needed
            manifest = annotator.annotate(manifest);
            generatedManifests.push(manifest);
            const manifestName = manifest.metadata.name;

            var differences = {};
            var method, lastAppliedConfiguration;

            var found = false;

            found = _.find(existing, {
              kind: manifest.kind,
              metadata: { name: manifestName }
            });
            remaining = _.reject(remaining, {
              kind: manifest.kind,
              metadata: { name: manifestName }
            });

            if (found) {
              // Handle updating Jobs/DaemonSets by deleting and recreating
              // Generally, we should never have a situtation where we are "updating" a job as we instead
              // create a new job if changes are detected, so this is here just to catch any odd case where
              // we need to recreate the job
              if (mustBeRecreated.indexOf(manifest.kind) >= 0) {
                method = "Recreate";
              } else {
                method = "Apply";
              }

              // Get the last applied configuration if one exists
              if (
                _.has(found, [
                  "metadata",
                  "annotations",
                  Annotations.LastAppliedConfiguration
                ])
              ) {
                var lastAppliedConfigurationString =
                  found.metadata.annotations[
                    Annotations.LastAppliedConfiguration
                  ];
                lastAppliedConfiguration = JSON.parse(
                  lastAppliedConfigurationString
                );
              }
              differences = manifestDiff(lastAppliedConfiguration, manifest);
              if (this.options.diff) {
                if (differences) {
                  this.emit(
                    "info",
                    "Differences for " +
                      manifestName +
                      ": " +
                      JSON.stringify(differences, null, 2)
                  );
                }
              }
            } else {
              if (this.options.createOnly) {
                method = "Create";
              } else {
                method = "Apply";
              }
            }

            if (
              !this.strategy.skipDeploy(manifest, found, differences) ||
              this.options.force
            ) {
              var promiseFunc = () => {
                // Skip deploying this manifest if it's newer than what we currently have to deploy
                var committerDate = null;
                if (
                  _.has(found, ["metadata", "annotations", Annotations.Commit])
                ) {
                  var commitAnnotation = JSON.parse(
                    found.metadata.annotations[Annotations.Commit]
                  );
                  if (
                    _.has(commitAnnotation, ["commit", "committer", "date"])
                  ) {
                    committerDate = new Date(
                      commitAnnotation.commit.committer.date
                    );
                  }
                }

                // Only check github if it's enabled
                var githubSkipCheck = Promise.resolve(false);
                if (this.options.github.enabled) {
                  var github = new Github(this.options.github.token);
                  githubSkipCheck = github
                    .getCommit(
                      this.options.github.user,
                      this.options.github.repo,
                      this.options.sha
                    )
                    .then(res => {
                      if (
                        committerDate &&
                        _.has(res, ["commit", "committer", "date"]) &&
                        committerDate.getTime() >
                          new Date(res.commit.committer.date).getTime()
                      ) {
                        this.emit(
                          "warn",
                          "Skipping " +
                            manifestName +
                            " because cluster has newer commit"
                        );
                        return true;
                      }
                      return false;
                    });
                }

                return githubSkipCheck.then(githubSkip => {
                  // Skip the update
                  if (githubSkip) {
                    return Promise.resolve();
                  }

                  const tmpApplyingConfigurationPath = path.join(
                    tmpDir,
                    this.options.cluster.metadata.name +
                      "-" +
                      path.basename(manifestFile.path) +
                      ".json"
                  );
                  const generatedApplyingConfiguration = JSON.stringify(
                    manifest
                  );

                  return writeFileAsync(
                    tmpApplyingConfigurationPath,
                    generatedApplyingConfiguration,
                    "utf8"
                  )
                    .then(() => {
                      // Do a dry-run check for dependencies (basically don't wait for any dependencies, just check what
                      // dependencies exists)
                      var checkAvailable = false;
                      if (!this.options.dryRun) {
                        // Check if this manifest has any dependencies and if it does, wait for them to be available
                        // before deploying it
                        checkAvailable = true;
                      }
                      return dependencies.ready(manifest, checkAvailable);
                    })
                    .then(() => {
                      this.emit(
                        "info",
                        "Running pre-deploy check to " +
                          method +
                          " " +
                          manifest.metadata.name
                      );
                      // Perform pre deploy check
                      return this.strategy
                        .preDeploy(
                          manifest,
                          found,
                          differences,
                          tmpApplyingConfigurationPath
                        )
                        .then(skip => {
                          if (skip) {
                            return;
                          }
                          // Initiate deploy
                          return this.kubectl
                            [method.toLowerCase()](tmpApplyingConfigurationPath) // eslint-disable-line no-unexpected-multiline
                            .then(msg => {
                              this.emit("info", msg);
                              this.emit("status", {
                                cluster: this.options.cluster.metadata.name,
                                name: manifestName,
                                kind: manifest.kind,
                                phase: "STARTED",
                                status: "IN_PROGRESS",
                                manifest: manifest
                              });

                              // Only check if resource is available if it's required
                              if (this.options.available.enabled) {
                                var availablePromise = status
                                  .available(
                                    manifest.kind,
                                    manifestName,
                                    differences
                                  )
                                  .then(() => {
                                    this.emit("status", {
                                      cluster: this.options.cluster.metadata
                                        .name,
                                      name: manifestName,
                                      kind: manifest.kind,
                                      phase: "COMPLETED",
                                      status: "SUCCESS",
                                      manifest: manifest
                                    });
                                  })
                                  .catch(err => {
                                    this.emit("error", err);
                                    this.emit("status", {
                                      cluster: this.options.cluster.metadata
                                        .name,
                                      reason: err.name || "other",
                                      name: manifestName,
                                      kind: manifest.kind,
                                      phase: "COMPLETED",
                                      status: "FAILURE",
                                      manifest: manifest
                                    });
                                    throw err;
                                  });
                                availablePromises.push(availablePromise);
                                // Wait for promise to resolve if we need to wait until available is successful
                                if (this.options.available.required) {
                                  return availablePromise;
                                }
                              }
                              return null;
                            })
                            .then(() => {
                              return backup
                                .save(
                                  this.options.cluster.metadata.name,
                                  manifest
                                )
                                .then(data => {
                                  if (!data) {
                                    this.emit(
                                      "debug",
                                      `No Backup of ${manifest.metadata.name}`
                                    );
                                  } else {
                                    this.emit(
                                      "debug",
                                      "backup result " + JSON.stringify(data)
                                    );
                                  }
                                })
                                .catch(err => {
                                  this.emit(
                                    "warn",
                                    `Warning: (${err
                                      ? err.message
                                      : "undefined"}) Backing up ${manifest
                                      .metadata.name} to ${this.options.cluster
                                      .metadata.name}`
                                  );
                                });
                            })
                            .catch(err => {
                              this.emit(
                                "error",
                                "Error running kubectl." +
                                  method.toLowerCase() +
                                  "('" +
                                  tmpApplyingConfigurationPath +
                                  "') " +
                                  err
                              );
                              throw err;
                            });
                        });
                    });
                });
              };

              // If this manifest has NO dependencies, we will deploy it first
              if (!dependencies.find(manifest)) {
                kubePromises.push(promiseFunc());
              } else {
                // If it DOES have dependencies, then we want to wait for everything without dependencies to have been deployed first
                promiseFuncsWithDependencies.push(promiseFunc);
              }
            } else {
              // No differences, verify service is available and emit status on it if AVAILABLE_ALL enabled
              const noDiffPromiseFunc = () => {
                if (this.options.available.all) {
                  this.emit("status", {
                    cluster: this.options.cluster.metadata.name,
                    name: manifestName,
                    kind: manifest.kind,
                    phase: "STARTED",
                    status: "IN_PROGRESS",
                    manifest: manifest
                  });

                  if (this.options.available.enabled) {
                    var availablePromise = status
                      .available(manifest.kind, manifestName)
                      .then(() => {
                        this.emit("status", {
                          cluster: this.options.cluster.metadata.name,
                          name: manifestName,
                          kind: manifest.kind,
                          phase: "COMPLETED",
                          status: "SUCCESS",
                          manifest: manifest
                        });
                      })
                      .catch(err => {
                        this.emit("error", err);
                        this.emit("status", {
                          cluster: this.options.cluster.metadata.name,
                          reason: err.name || "other",
                          name: manifestName,
                          kind: manifest.kind,
                          phase: "COMPLETED",
                          status: "FAILURE",
                          manifest: manifest
                        });
                        throw err;
                      });
                    availablePromises.push(availablePromise);
                    // Wait for promise to resolve if we need to wait until available is successful
                    if (this.options.available.required) {
                      return availablePromise;
                    }
                  }
                }
                // Nothing to do, just resolve
                return Promise.resolve();
              };
              kubePromises.push(noDiffPromiseFunc());
            }
          });

          // TODO: add dry run check before saving to Elroy
          // Handles saving generated manifests to the Elroy service
          kubePromises.push(
            elroy.start(generatedManifests).catch(elroyErr => {
              // Ignore errors from elroy (we just log them)
              this.emit("warn", `Elroy error: ${elroyErr}`);
            })
          );

          return Promise.all(kubePromises).then(() => {
            // After all manifests without dependencies have been successfully deployed, start with the
            // manifests that have dependencies
            var promisesWithDependencies = [];
            _.each(promiseFuncsWithDependencies, promiseFunc => {
              promisesWithDependencies.push(promiseFunc());
            });
            return Promise.all(promisesWithDependencies);
          });
        })
        .then(() => {
          let res = {
            name: this.options.cluster.metadata.name,
            manifests: generatedManifests
          };
          // Can only consider cluster deployment status completed if available checking is enabled,
          // otherwise it would be inaccurate
          if (this.options.available.enabled) {
            return Promise.all(availablePromises)
              .then(() => {
                return this.strategy.allAvailable(generatedManifests);
              })
              .then(() => {
                this.emit("status", {
                  name: this.options.cluster.metadata.name,
                  kind: "Cluster",
                  phase: "COMPLETED",
                  status: "SUCCESS",
                  manifest: this.options.cluster
                });
              })
              .then(() => {
                if (this.inWatcherUpdateBlacklist(generatedManifests)) {
                  return;
                }
                // Update Elroy that the resource has been deployed successfully
                return elroy.done().catch(elroyErr => {
                  // Ignore errors from elroy (we just log them)
                  this.emit("warn", `Elroy error: ${elroyErr}`);
                });
              })
              .then(() => {
                return res;
              });
          }
          return res;
        })
        .then(resolve)
        .catch(err => {
          this.emit("error", err);
          this.emit("status", {
            reason: err.name || "other",
            name: this.options.cluster.metadata.name,
            kind: "Cluster",
            phase: "COMPLETED",
            status: "FAILURE",
            manifest: this.options.cluster
          });
          elroy.fail(err).catch(elroyErr => {
            // Ignore errors from elroy (we just log them)
            this.emit("warn", `Elroy error: ${elroyErr}`);
          });
          reject(err);
        });
    });
  }
}

module.exports = Manifests;
