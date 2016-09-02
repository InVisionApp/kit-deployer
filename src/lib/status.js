"use strict";

const _ = require("lodash");
const Promise = require("bluebird");
const EventEmitter = require("events").EventEmitter;
const KeepAlive = require("./keep-alive");
const HealthCheck = require("./health-check");
const supportedTypes = [
	"deployment",
	"ingress",
	"service",
	"secret",
	"job",
	"daemonset",
	"persistentvolumeclaim"
];

class Status extends EventEmitter {
	constructor(options) {
		super();
		this.options = _.merge({
			healthCheck: true,
			healthCheckGracePeriod: undefined,
			keepAlive: false,
			keepAliveInterval: 30, // 30 seconds
			timeout: 10 * 60, // 10 minutes
			kubectl: undefined
		}, options);
		this.kubectl = this.options.kubectl;
	}

	get supportedTypes() {
		return supportedTypes;
	}

	/**
	 * Returns a promise that resolves when the provided resource is available
	 * @param {string} resource - A single resource type to watch
	 * @param {string} name - The metadata name of the resource
	 * @fires Status#error
	 * @fires Status#info
	 * @return {object} promise
	 */
	available(resource, name) {
		return new Promise((resolve, reject) => {
			let timeoutId, keepAlive;

			if (this.supportedTypes.indexOf(resource.toLowerCase()) < 0) {
				return reject(new Error("Unsupported resource " + resource + ":" + name));
			}

			if (this.options.keepAlive) {
				keepAlive = new KeepAlive("Still waiting for " + resource + ":" + name + " to be available...", this.options.keepAliveInterval);
				keepAlive.on("info", (msg) => {
					this.emit("info", msg);
				});
				keepAlive.start();
			}

			// Setup healthcheck
			const healthCheck = new HealthCheck(this.kubectl, this.options.healthCheckGracePeriod);
			healthCheck.on("error", (err) => {
				this.emit("_error", err);
			});

			// Setup watcher
			const watcher = this.kubectl.watch(resource, name);

			// Setup error listener
			this.on("_error", (err) => {
				this.emit("error", err);
				watcher.stop();
				healthCheck.stop();
				if (keepAlive) {
					keepAlive.stop();
				}
				clearTimeout(timeoutId);
				reject(err);
			});

			watcher.on("error", (err) => {
				this.emit("_error", err);
			});
			watcher.on("change", (res) => {
				function stop(context) {
					context.emit("info", resource + ":" + name + " is available");
					watcher.stop();
					healthCheck.stop();
					if (keepAlive) {
						keepAlive.stop();
					}
					clearTimeout(timeoutId);
					resolve(res);
				}

				switch (resource) {
					case "Deployment":
						// Need to verify all pods are available within the deployment
						var generation = null;
						if (_.has(res, "metadata", "generation") && res.metadata.generation !== undefined) {
							generation = parseInt(res.metadata.generation);
						}
						var observedGeneration = null;
						if (_.has(res, "status", "observedGeneration") && res.status.observedGeneration !== undefined) {
							observedGeneration = parseInt(res.status.observedGeneration);
						}
						var availableReplicas = null;
						if (_.has(res, "status", "availableReplicas") && res.status.availableReplicas !== undefined) {
							availableReplicas = parseInt(res.status.availableReplicas);
						}
						var replicas = null;
						if (_.has(res, "status", "replicas") && res.status.replicas !== undefined) {
							replicas = parseInt(res.status.replicas);
						}
						if (generation !== null && observedGeneration !== null) {
							this.emit("info", resource + ":" + name + " has " + observedGeneration + "/" + generation + " observed generation");
						}
						if (availableReplicas !== null && replicas !== null) {
							this.emit("info", resource + ":" + name + " has " + availableReplicas + "/" + replicas + " replicas available");
						}
						if (generation !== null &&
							observedGeneration !== null &&
							availableReplicas !== null &&
							replicas !== null &&
							observedGeneration >= generation &&
							availableReplicas >= replicas) {
							stop(this);
						}
						break;
					case "Job":
						// Need to verify job has completed successfully
						var succeeded = null;
						if (_.has(res, "status", "succeeded") && res.status.succeeded !== undefined) {
							succeeded = parseInt(res.status.succeeded);
						}
						if (succeeded !== null) {
							this.emit("info", resource + ":" + name + " has " + succeeded + "/1 succeeded");
							if (succeeded) {
								stop(this);
							}
						}
						break;
					case "DaemonSet":
						// Need to verify daemonset has desired number scheduled
						var desiredNumberScheduled = null;
						if (_.has(res, "status", "desiredNumberScheduled") && res.status.desiredNumberScheduled !== undefined) {
							desiredNumberScheduled = parseInt(res.status.desiredNumberScheduled);
						}
						var currentNumberScheduled = null;
						if (_.has(res, "status", "currentNumberScheduled") && res.status.currentNumberScheduled !== undefined) {
							currentNumberScheduled = parseInt(res.status.currentNumberScheduled);
						}
						if (desiredNumberScheduled !== null && currentNumberScheduled !== null) {
							this.emit("info", resource + ":" + name + " has " + currentNumberScheduled + "/" + desiredNumberScheduled + " scheduled");
							if (desiredNumberScheduled >= currentNumberScheduled) {
								stop(this);
							}
						}
						break;
					case "Service":
					case "Secret":
					case "PersistentVolumeClaim":
					case "Ingress":
					default:
						stop(this);
				}
			});

			// Start watching
			watcher.start();

			// Start observing health of deployment
			if (this.options.healthCheck) {
				healthCheck.start(name);
			}

			timeoutId = setTimeout(() => {
				watcher.stop();
				healthCheck.stop();
				if (keepAlive) {
					keepAlive.stop();
				}
				reject(new Error("Timeout waiting for " + resource + ":" + name));
			}, parseInt(this.options.timeout) * 1000);
		});
	}
}

module.exports = Status;
