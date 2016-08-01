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
	}

	send(cluster, name, phase, status) {
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
			this.emit("info", cluster + " - Sending payload to " + urlWithService + " for " + name + " with status " + phase + "/" + status);
			promises.push(request({
				method: "POST",
				uri: urlWithService,
				body: payload,
				json: true
			}).then((res) => {
				this.emit("info", cluster + " - Successfully sent payload to " + urlWithService + " for " + name + " with status " + phase + "/" + status);
				return res;
			}).catch((err) => {
				// TODO: webhook can silently fail (only printing the error message and not causing a "failed" deploy because we don't wait for the webhook to finish)
				if (err.message) {
					this.emit("error", err.message);
				} else {
					this.emit("error", err);
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

	// Call this method whenever there is a status update. It will automatically send
	// a payload to the webhook.
	change(status) {
		if (status.kind === "Cluster") {
			const name = this.getManifestName(status);
			return this.send(status.name, name, status.phase, status.status);
		}
	}
}

module.exports = Webhook;
