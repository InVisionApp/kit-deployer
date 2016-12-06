"use strict";

const _ = require("lodash");
const Promise = require("bluebird");
const EventEmitter = require("events");
const supportedTypes = [
	"deployments",
	"services",
	"secrets",
	"jobs"
];

const dependenciesKey = "kit-deployer/dependency-selector";

// Handles dependencies of manifest files
// Must be instantiated with an instance of kubectl
class Dependencies extends EventEmitter {
	constructor(options) {
		super();
		this.options = _.merge({
			timeout: 10 * 60, // 10 minutes
			wait: 3, // 3 seconds
			kubectl: undefined
		}, options);
		this.kubectl = this.options.kubectl;
		this.dependencyPromises = {};
	}

	// Returns dependency selector or null if none set
	find(manifest) {
		if (manifest && manifest.metadata && manifest.metadata.annotations && manifest.metadata.annotations[dependenciesKey]) {
			return manifest.metadata.annotations[dependenciesKey];
		}
		return null;
	}

	/**
	 * Returns a promise that will be resolved when the provided service's dependencies
	 * are all available
	 * @param {string} manifest
	 * @param {string} checkAvailable
	 * @fires Dependencies#debug
	 * @fires Dependencies#info
	 */
	ready(manifest, checkAvailable) {
		return new Promise((resolve, reject) => {
			var promises = [];

			// Find dependencies in manifest
			var selector = this.find(manifest);
			if (selector) {
				this.emit("debug", "Dependency detected for " + manifest.metadata.name + " <= " + selector);
				// Only check for dependency availablity if enabled
				if (checkAvailable) {
					promises.push(this
						.available(selector)
						.then((res) => {
							this.emit("info", "Dependency available for " + manifest.metadata.name + " <= " + selector);
							return res;
						})
					);
				}
			}

			// If any dependencies, resolve only after all of them are available
			Promise
				.all(promises)
				.then(resolve)
				.catch(reject);
		});
	}

	// Returns a promise that will be resolved when the service is considered available
	available(selector) {
		if (this.dependencyPromises[selector]) {
			return this.dependencyPromises[selector];
		}

		var dependency = {};
		dependency[selector] = this.check(selector);
		_.merge(this.dependencyPromises, dependency[selector]);
		return dependency[selector];
	}

	check(selector) {
		return new Promise((resolve, reject) => {
			var available = false;
			var rejected = false;
			// Reject as soon as timeout time has passed and service is still not available
			setTimeout(() => {
				if (!available && !rejected) {
					rejected = true;
					reject(new Error("Timeout waiting for " + selector));
				}
			}, parseInt(this.options.timeout) * 1000);

			var attempt = () => {
				this.kubectl
					// TODO: daemonsets not supported yet
					.list(supportedTypes.join(","), selector)
					.then((resources) => {
						_.each(resources, (resource) => {
							available = true;
							if (resource.kind === "Deployment") {
								// Need to check how many are available and if all are
								// not, we reject and check again later
								if (resource.status.availableReplicas !== resource.status.replicas) {
									throw new Error("Dependency " + resource.metadata.name + " not available yet");
								}
							} else if (resource.kind === "Job") {
								// Need to verify job has completed successfully
								if (!resource.status.succeeded) {
									throw new Error("Dependency " + resource.metadata.name + " not available yet");
								}
							}
						});
						resolve(resources);
					})
					.catch(() => {
						// If the request did not return a result, try again after wait time
						setTimeout(attempt, parseInt(this.options.wait) * 1000);
					});
			};

			// start checking
			attempt();
		});
	}
}

module.exports = Dependencies;
