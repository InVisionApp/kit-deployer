"use strict";

const _ = require("lodash");
const EventEmitter = require("events").EventEmitter;
const request = require("request-promise");

/**
 * Use the change method to automatically send necessary webhooks
 * @param {object} options - Object of parameters (url, isRollback)
 * @fires Webhook#done
 * @fires Webhook#info
 * @fires Webhook#error
 */
class Webhook extends EventEmitter {
	constructor(options) {
		super();
		this.options = _.merge({
			urls: [],
			isRollback: false
		}, options);
		this.manifests = {};
		this.clusters = [];
		if (!this.options.urls.length) {
			throw new Error("Must provide at least 1 url");
		}

		this._sentPromise = new Promise((resolve, reject) => {
			this.on("done", (err) => {
				if (!err) {
					resolve();
				} else {
					reject(err);
				}
			});
		});
	}

	send(name, phase, status) {
		const payload = {
			// TODO: dynamic name for payload?
			name: "kubernetes-deploy",
			url: undefined,
			provider: "CodeShip/Kubernetes",
			build: {
				full_url: undefined,
				number: undefined,
				queue_id: undefined,
				phase: phase,
				status: status,
				url: undefined,
				scm: {
					url: undefined,
					branch: undefined,
					commit: undefined
				},
				parameters: {
					REVERT: (this.options.isRollback) ? "true" : "false",
					hash: undefined,
					jobID: undefined,
					CHEFNODE: undefined,
					BRANCH: undefined
				},
				log: undefined,
				artifacts: {}
			}
		};

		// TODO: we should not have to append the "name" to the url
		const promises = [];
		_.each(this.options.urls, (url) => {
			const urlWithService = url + "/" + name;
			const phaseStatusMessage = urlWithService + " for " + name + " with status " + phase + "/" + status;
			this.emit("info", "Sending payload to " + phaseStatusMessage);
			promises.push(request({
				method: "POST",
				uri: urlWithService,
				body: payload,
				json: true
			}).then((res) => {
				this.emit("info", "Successfully sent payload to " + phaseStatusMessage);
				return res;
			}).catch((err) => {
				// TODO: webhook can silently fail (only printing the error message and not causing a "failed" deploy because we don't wait for the webhook to finish)
				const errPrefix = "Error sending payload to " + phaseStatusMessage + ": ";
				if (err && err.message) {
					this.emit("error", errPrefix + err.message);
				} else {
					this.emit("error", errPrefix + err);
				}
			}));
		});
		return Promise.all(promises);
	}

	// Allows setting an alias via annotations as well as support for manifests that are renamed dynamically (such as jobs)
	// so that the real name is sent in the webhook instead of the dynamically generated name.
	getManifestName(status) {
		const aliasNameKey = "kit-deployer/alias-name";
		const originalNameKey = "kit-deployer/original-name";
		if (_.has(status.manifest, ["metadata", "annotations", aliasNameKey])) {
			return status.manifest.metadata.annotations[aliasNameKey];
		} else if (_.has(status.manifest, ["metadata", "annotations", originalNameKey])) {
			return status.manifest.metadata.annotations[originalNameKey];
		} else {
			return status.manifest.metadata.name;
		}
	}

	// Call this method whenever there is a status update to check if the
	// deployment was successful or not. It will automatically send a payload to
	// the webhook once the deployment is finished with all clusters.
	change(status) {
		if (status.kind === "Cluster") {
			switch (status.phase) {
				case "STARTED":
					this.clusters.push(status);
					break;
				case "COMPLETED":
					this.clusters = _.reject(this.clusters, {name: status.name});
					break;
				default:
					this.emit("error", "Unknown phase for cluster: " + status.phase);
			}
			// If deployer is done and all clusters have completed
			if (this.clusters.length === 0) {
				const promises = [];
				_.each(this.manifests, (manifestStatus) => {
					const name = this.getManifestName(manifestStatus);
					promises.push(this.send(name, manifestStatus.phase, manifestStatus.status));
				});
				Promise
					.all(promises)
					.then(() => {
						this.emit("done", null);
					})
					.catch((err) => {
						this.emit("done", err);
					});
			}
		} else {
			const name = this.getManifestName(status);
			if (!this.manifests[name]) {
				// Always send the first status we receive for a manifest
				this.manifests[name] = status;
				this.send(name, status.phase, status.status);
			} else if (this.manifests[name].status !== "FAILURE") {
				// If the status is failure for any cluster, we consider the deployment as a whole a failure, so keep failure status
				this.manifests[name] = status;
			}
		}
	}

	sent() {
		return this._sentPromise;
	}
}

module.exports = Webhook;
