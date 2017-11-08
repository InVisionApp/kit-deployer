"use strict";

const spawn = require("child_process").spawn;
const fs = require("fs");
const path = require("path");
const Promise = require("bluebird");
const EventEmitter = require("events").EventEmitter;
const diff = require("deep-diff");
const KubeClient = require("kubernetes-client");
const _ = require("lodash");
const yaml = require("js-yaml");

class KubectlError extends Error {
  constructor(prefix, err) {
    super(`${prefix}: ${err.message}`);
  }
}

class KubectlWatcher extends EventEmitter {
  constructor(kubectl, resource, name, interval) {
    super();
    this.kubectl = kubectl;
    this.interval = interval * 1000 || 3 * 1000; // 3 second polling
    this.resource = resource;
    this.name = name;
    this._previousResult;
  }

  start() {
    this.query();
  }

  query() {
    this._timeoutId = setTimeout(() => {
      this.kubectl
        .get(this.resource, this.name)
        .then(result => {
          // Only emit a change event if there was a change in the result
          if (diff(result, this._previousResult)) {
            this.emit("change", result);
          }
          this._previousResult = result;
        })
        .catch(err => {
          this.emit("error", err);
        });
      this.query();
    }, this.interval);
  }

  stop() {
    clearTimeout(this._timeoutId);
    this.removeAllListeners();
  }
}

class KubectlEventWatcher extends EventEmitter {
  constructor(kubectl, since, interval) {
    super();
    this.kubectl = kubectl;
    this.interval = interval * 1000 || 3 * 1000; // 3 second polling
    this._previousEvents = {};

    if (since instanceof Date) {
      this.since = since.getTime();
    } else if (since === -1) {
      this.since = since;
    } else {
      this.since = null;
    }
  }

  start() {
    if (this.since === null) {
      this.since = new Date().getTime();
    }
    this.query();
  }

  query() {
    this._timeoutId = setTimeout(() => {
      this.kubectl
        .get("events")
        .then(result => {
          // Store UIDs of events so we know which events are new
          if (_.has(result, ["items"])) {
            _.each(result.items, event => {
              // All events should have UIDs as described by kubernetes metadata spec (but just being safe)
              if (_.has(event, ["metadata", "uid"])) {
                if (
                  this._previousEvents[event.metadata.uid] &&
                  this._previousEvents[event.metadata.uid].count == event.count
                ) {
                  // We already emitted this event and the count has not changed, so do nothing
                } else if (
                  _.has(event, ["firstTimestamp"]) &&
                  new Date(event.firstTimestamp).getTime() < this.since
                ) {
                  // Ignore events that first occurred before since date
                } else {
                  // New event, emit it
                  this._previousEvents[event.metadata.uid] = event;
                  this.emit("new", event);
                }
              }
            });
          }
        })
        .catch(err => {
          this.emit("error", err);
        });
      this.query();
    }, this.interval);
  }

  stop() {
    clearTimeout(this._timeoutId);
    this.removeAllListeners();
  }
}

class Current {
  constructor(kubeconfig) {
    // NOTE: we could not simply use KubeClient.config.fromKubeconfig(kubeconfig) because
    // it does not correctly resolve the relative cert paths
    if (!kubeconfig) {
      throw new Error("kubeconfig is required");
    }
    this.currentContext = _.find(kubeconfig.contexts, {
      name: kubeconfig["current-context"]
    });
    if (!this.currentContext) {
      throw new Error("Unable to configure kubeapi with current context");
    }
    this.currentCluster = _.find(kubeconfig.clusters, {
      name: this.currentContext.context.cluster
    });
    if (!this.currentCluster) {
      throw new Error("Unable to configure kubeapi with current cluster");
    }
    this.currentUser = _.find(kubeconfig.users, {
      name: this.currentContext.context.user
    });
    if (!this.currentUser) {
      throw new Error("Unable to configure kubeapi with current user");
    }
  }
  get context() {
    return this.currentContext;
  }
  get cluster() {
    return this.currentCluster;
  }
  get user() {
    return this.currentUser;
  }
}

class Kubeapi {
  constructor(cwd, kubeconfig) {
    let current = new Current(kubeconfig);
    if (!cwd) {
      throw new Error("cwd is required for Kubeapi");
    }
    var options = {
      url: current.cluster.cluster.server,
      namespace: current.context.context.namespace
    };
    if (current.user.user.token) {
      options.auth = {
        bearer: current.user.user.token
      };
      this.core = new KubeClient.Core(options);
      this.batch = new KubeClient.Batch(options);
      this.ext = new KubeClient.Extensions(options);
      this.api = new KubeClient.Api(options);
    } else {
      options.ca = fs.readFileSync(
        path.join(cwd, current.cluster.cluster["certificate-authority"])
      );
      options.cert = fs.readFileSync(
        path.join(cwd, current.user.user["client-certificate"])
      );
      options.key = fs.readFileSync(
        path.join(cwd, current.user.user["client-key"])
      );
      this.core = new KubeClient.Core(options);
      this.batch = new KubeClient.Batch(options);
      this.ext = new KubeClient.Extensions(options);
      this.api = new KubeClient.Api(options);
    }
  }

  static get supportedTypes() {
    return [
      "deployment",
      "ingress",
      "service",
      "secret",
      "job",
      "scheduledjob",
      "cronjob",
      "daemonset",
      "persistentvolumeclaim",
      "events"
    ];
  }

  static isSupportedType(type) {
    let resource = type.toLowerCase();
    return Kubeapi.supportedTypes.indexOf(resource) >= 0;
  }
}

class Kubectl extends EventEmitter {
  constructor(conf) {
    super();
    this.dryRun = conf.dryRun || false;
    this.current = new Current(conf.kubeconfig);
    this.kubeapi = new Kubeapi(conf.cwd, conf.kubeconfig);

    this.binary = conf.binary || "kubectl";

    this.kubeconfigFile = conf.kubeconfigFile || "";
    this.endpoint = conf.endpoint || "";
  }

  /**
	 * Spawn is used internally by methods like get and create and it emits a message
	 * for whenever its called so you can track the number of processes spawned if needed.
	 * @param {array} args - Array list of the command args
	 * @param {func} done - Function to call when done
	 * @fires KubectlWatcher#spawn which tells when spawn is called and with what args
	 */
  spawn(args, done) {
    this.emit("spawn", args);
    var ops = new Array();

    // Prefer configuration file over endpoint if both are defined
    if (this.kubeconfigFile) {
      ops.push("--kubeconfig");
      ops.push(this.kubeconfigFile);
    } else {
      ops.push("-s");
      ops.push(this.endpoint);
    }

    var kube = spawn(this.binary, ops.concat(args));
    var stdout = "";
    var stderr = "";

    kube.stdout.on("data", data => {
      stdout += data;
    });

    kube.stderr.on("data", data => {
      // If it's only a warning message just log it and move on
      if (data && typeof data.toString === "function") {
        let err = data.toString("utf8");
        if (err.startsWith("Warning:")) {
          this.emit("warn", err);
          return;
        }
      }
      stderr += data;
    });

    kube.on("close", code => {
      if (!stderr) {
        stderr = undefined;
      }

      if (typeof done === "function") {
        done(stderr, stdout);
      }
    });

    return kube;
  }

  get(resource, name) {
    return new Promise((resolve, reject) => {
      resource = resource.toLowerCase();
      const method = "get";
      // Avoid passing "undefined" to kubeapi methods
      if (!name) {
        name = "";
      }

      // Will use spawn cmd if not supported by kubeapi
      const cmd = [
        method,
        `--namespace=${this.current.context.context.namespace}`,
        "--output=json",
        resource
      ];
      if (name) {
        cmd.push(name);
      }
      if (!Kubeapi.isSupportedType(resource)) {
        this.spawn(cmd, (spawnErr, spawnData) => {
          if (spawnErr) {
            return reject(new KubectlError("spawn", spawnErr));
          }
          return resolve(JSON.parse(spawnData));
        });
        return;
      }

      try {
        let core;
        if (_.isFunction(this.kubeapi.core.namespaces[resource])) {
          core = this.kubeapi.core.namespaces[resource](name);
        } else {
          core = this.kubeapi.core.namespaces[resource];
        }
        core[method]((err, data) => {
          if (err) {
            return reject(new KubectlError("core", err));
          }
          return resolve(data);
        });
        this.emit("request", {
          method: method,
          resource: resource,
          name: name
        });
      } catch (coreErr) {
        // It is not a core resource type, so try using the extensions api
        if (coreErr instanceof TypeError) {
          try {
            let batch;
            if (_.isFunction(this.kubeapi.batch.namespaces[resource])) {
              batch = this.kubeapi.batch.namespaces[resource](name);
            } else {
              batch = this.kubeapi.batch.namespaces[resource];
            }
            batch[method]((batchErr, batchData) => {
              if (batchErr) {
                return reject(new KubectlError("batch", batchErr));
              }
              return resolve(batchData);
            });
            this.emit("request", {
              method: method,
              resource: resource,
              name: name
            });
          } catch (batchErr) {
            if (batchErr instanceof TypeError) {
              try {
                let ext;
                if (_.isFunction(this.kubeapi.ext.namespaces[resource])) {
                  ext = this.kubeapi.ext.namespaces[resource](name);
                } else {
                  ext = this.kubeapi.ext.namespaces[resource];
                }
                ext[method]((extErr, extData) => {
                  if (extErr) {
                    return reject(new KubectlError("ext", extErr));
                  }
                  return resolve(extData);
                });
                this.emit("request", {
                  method: method,
                  resource: resource,
                  name: name
                });
              } catch (extErr) {
                if (extErr instanceof TypeError) {
                  // If that fails, then fallback to spawning a kubectl process
                  this.spawn(cmd, (spawnErr, spawnData) => {
                    if (spawnErr) {
                      return reject(new KubectlError("spawn", spawnErr));
                    }
                    return resolve(JSON.parse(spawnData));
                  });
                } else {
                  reject(new KubectlError("ext", extErr));
                }
              }
            } else {
              reject(new KubectlError("batch", batchErr));
            }
          }
        } else {
          reject(new KubectlError("core", coreErr));
        }
      }
    });
  }

  list(resource, selector) {
    return new Promise((resolve, reject) => {
      var args = ["get", "--output=json", resource];
      if (selector) {
        args.push("-l");
        args.push(selector);
      }
      this.spawn(args, (err, data) => {
        if (err) {
          return reject(err);
        }
        return resolve(JSON.parse(data));
      });
    });
  }

  create(filepath) {
    return new Promise((resolve, reject) => {
      if (this.dryRun) {
        return resolve(
          `DryRun is enabled: skipping kubectl.create(${filepath})`
        );
      }
      this.spawn(["create", "--save-config=true", "-f", filepath], function(
        err,
        data
      ) {
        if (err) {
          return reject(err);
        }
        return resolve(data);
      });
    });
  }

  recreate(filepath) {
    if (this.dryRun) {
      return Promise.resolve(
        `DryRun is enabled: skipping kubectl.recreate(${filepath})`
      );
    }
    return this.delete(filepath).then(() => {
      return new Promise((resolve, reject) => {
        this.spawn(["apply", "-f", filepath], function(err, data) {
          if (err) {
            return reject(err);
          }
          return resolve(data);
        });
      });
    });
  }

  delete(filepath) {
    return new Promise((resolve, reject) => {
      if (this.dryRun) {
        return resolve(
          `DryRun is enabled: skipping kubectl.delete(${filepath})`
        );
      }
      this.spawn(["delete", "-f", filepath], (err, data) => {
        if (err) {
          if (
            typeof err === "string" &&
            err.includes("Error from server (NotFound)")
          ) {
            // The resource already doesn't exist so assume the delete was
            // successful. This will avoid concurrency situtations as well as
            // avoid throwing a failure when really the endresult is still what
            // was desired.
            this.emit(
              "warn",
              `Attempting to delete ${filepath} which does not exist on the server`
            );
            return resolve(data);
          }
          return reject(err);
        }
        return resolve(data);
      });
    });
  }

  deleteByName(kind, name) {
    return new Promise((resolve, reject) => {
      if (this.dryRun) {
        return resolve(
          `DryRun is enabled: skipping kubectl.deleteByName(${filepath})`
        );
      }
      this.spawn(["delete", kind, name], (err, data) => {
        if (err) {
          if (
            typeof err === "string" &&
            err.includes("Error from server (NotFound)")
          ) {
            // The resource already doesn't exist so assume the delete was
            // successful. This will avoid concurrency situtations as well as
            // avoid throwing a failure when really the endresult is still what
            // was desired.
            this.emit(
              "warn",
              `Attempting to delete ${kind}:${name} which does not exist on the server`
            );
            return resolve(data);
          }
          return reject(err);
        }
        return resolve(data);
      });
    });
  }

  apply(filepath) {
    return new Promise((resolve, reject) => {
      if (this.dryRun) {
        return resolve(
          `DryRun is enabled: skipping kubectl.apply(${filepath})`
        );
      }
      this.spawn(["apply", "-f", filepath], function(err, data) {
        if (err) {
          return reject(err);
        }
        return resolve(data);
      });
    });
  }

  load(filepath) {
    if (filepath.endsWith(".yaml")) {
      return yaml.safeLoad(fs.readFileSync(filepath));
    } else if (filepath.endsWith(".json")) {
      return JSON.parse(fs.readFileSync(filepath));
    }
    return false;
  }

  /**
	 * Watches given resource and emits events on changes.
	 * @param {string} resource - A single resource type to watch
	 * @param {string} name - The name of the resource to watch
	 * @fires KubectlWatcher#change
	 * @fires KubectlWatcher#error
	 */
  watch(resource, name, interval) {
    return new KubectlWatcher(this, resource, name, interval);
  }

  /**
	 * Watches events for given resource and emits events on new events.
	 * @param {string} since - Will only emit events that first happened after this
	 * datetime, by default is the date at which you call the start method. Set to
	 * -1 to emit all events.
	 * @fires KubectlWatcher#new
	 * @fires KubectlWatcher#error
	 */
  events(since, interval) {
    return new KubectlEventWatcher(this, since, interval);
  }
}

module.exports = Kubectl;
