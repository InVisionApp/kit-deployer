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

class KubectlWatcher extends EventEmitter {
	constructor(kubectl, resource, name) {
		super();
		this.kubectl = kubectl;
		this.interval = 3 * 1000; // 3 second polling
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
				.then((result) => {
					// Only emit a change event if there was a change in the result
					if (diff(result, this._previousResult)) {
						this.emit("change", result);
					}
					this._previousResult = result;
				})
				.catch((err) => {
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
	constructor(kubectl, since) {
		super();
		this.kubectl = kubectl;
		this.interval = 3 * 1000; // 3 second polling
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
				.then((result) => {
					// Store UIDs of events so we know which events are new
					if (_.has(result, ["items"])) {
						_.each(result.items, (event) => {
							// All events should have UIDs as described by kubernetes metadata spec (but just being safe)
							if (_.has(event, ["metadata", "uid"])) {
								if (this._previousEvents[event.metadata.uid] && this._previousEvents[event.metadata.uid].count == event.count) {
									// We already emitted this event and the count has not changed, so do nothing
								} else if (_.has(event, ["firstTimestamp"]) && new Date(event.firstTimestamp).getTime() < this.since) {
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
				.catch((err) => {
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

class Kubeapi {
	constructor(cwd, kubeconfig) {
		// NOTE: we could not simply use KubeClient.config.fromKubeconfig(kubeconfig) because
		// it does not correctly resolve the relative cert paths
		if (!cwd || !kubeconfig) {
			throw new Error("cwd and kubeconfig are required for Kubeapi");
		}
		const currentContext = _.find(kubeconfig.contexts, {name: kubeconfig["current-context"]});
		if (!currentContext) {
			throw new Error("Unable to configure kubeapi with current context");
		}
		const currentCluster = _.find(kubeconfig.clusters, {name: currentContext.context.cluster});
		if (!currentCluster) {
			throw new Error("Unable to configure kubeapi with current cluster");
		}
		const currentUser = _.find(kubeconfig.users, {name: currentContext.context.user});
		if (!currentUser) {
			throw new Error("Unable to configure kubeapi with current user");
		}

		var options = {
			url: currentCluster.cluster.server,
			namespace: currentContext.context.namespace
		};
		if (currentUser.user.token) {
			options.auth = {
				bearer: currentUser.user.token
			};
			this.core = new KubeClient.Core(options);
			this.ext = new KubeClient.Extensions(options);
			this.api = new KubeClient.Api(options);
		} else {
			options.ca = fs.readFileSync(path.join(cwd, currentCluster.cluster["certificate-authority"]));
			options.cert = fs.readFileSync(path.join(cwd, currentUser.user["client-certificate"]));
			options.key = fs.readFileSync(path.join(cwd, currentUser.user["client-key"]));
			this.core = new KubeClient.Core(options);
			this.ext = new KubeClient.Extensions(options);
			this.api = new KubeClient.Api(options);
		}
	}
}

class Kubectl extends EventEmitter {
	constructor(conf) {
		super();
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

		kube.stdout.on("data", function(data) {
			stdout += data;
		});

		kube.stderr.on("data", function(data) {
			stderr += data;
		});

		kube.on("close", function(code) {
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
			const method = "get";
			// Avoid passing "undefined" to kubeapi get methods
			if (!name) {
				name = "";
			}
			try {
				this.kubeapi.core.namespaces[resource](name).get(function(err, data) {
					if (err) {
						return reject(err);
					}
					return resolve(data);
				});
				this.emit("request", {
					method: method,
					resource: resource,
					name: name
				});
			} catch(coreErr) {
				// It is not a core resource type, so try using the extensions api
				if (coreErr instanceof TypeError) {
					try {
						this.kubeapi.ext.namespaces[resource](name).get(function(extErr, extData) {
							if (extErr) {
								return reject(extErr);
							}
							return resolve(extData);
						});
						this.emit("request", {
							method: method,
							resource: resource,
							name: name
						});
					} catch(extErr) {
						// It is not a core resource type, so try using the extensions api
						if (extErr instanceof TypeError) {
							// If that fails, then fallback to spawning a kubectl process
							const cmd = ["get", "--output=json", resource];
							if (name) {
								cmd.push(name);
							}
							this.spawn(cmd, (spawnErr, spawnData) => {
								if (spawnErr) {
									return reject(new Error(spawnErr));
								}
								return resolve(JSON.parse(spawnData));
							});
						} else {
							reject(extErr);
						}
					}
				} else {
					reject(coreErr);
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
			this.spawn(["create", "-f", filepath], function(err, data) {
				if (err) {
					return reject(err);
				}
				return resolve(data);
			});
		});
	}

	recreate(filepath) {
		return this
			.delete(filepath)
			.then(() => {
				return new Promise((resolve, reject) => {
					this.spawn(["create", "-f", filepath], function(err, data) {
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
			this.spawn(["delete", "-f", filepath], function(err, data) {
				if (err) {
					return reject(err);
				}
				return resolve(data);
			});
		});
	}

	deleteByName(kind, name) {
		return new Promise((resolve, reject) => {
			this.spawn(["delete", kind, name], function(err, data) {
				if (err) {
					return reject(err);
				}
				return resolve(data);
			});
		});
	}

	apply(filepath) {
		return new Promise((resolve, reject) => {
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
	watch(resource, name) {
		return new KubectlWatcher(this, resource, name);
	}

	/**
	 * Watches events for given resource and emits events on new events.
	 * @param {string} since - Will only emit events that first happened after this
	 * datetime, by default is the date at which you call the start method. Set to
	 * -1 to emit all events.
	 * @fires KubectlWatcher#new
	 * @fires KubectlWatcher#error
	 */
	events(since) {
		return new KubectlEventWatcher(this, since);
	}
}

module.exports = Kubectl;
