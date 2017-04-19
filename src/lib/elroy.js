"use strict";

const _ = require("lodash");
const Promise = require("bluebird");
const EventEmitter = require("events");
const request = require("request-promise");

class Elroy extends EventEmitter {

	constructor(options) {
		super();
		this.options = _.merge({
			url: undefined,
			secret: undefined,
			enabled: false
		}, options);
		this.request = request;
		this.emit("info", `Saving using Elroy is ${this.options.enabled}`);
	}

	/**
	 * Save manifest to Elroy
	 *
	 * @param  {string} clusterName The cluster name
	 * @param  {string} manifest    The json manifest
	 * @return {promise}            Promise that will resolve or reject
	 */
	save(uuid, clusterName, manifest, isRollback, error) {
		return new Promise((resolve, reject) => {

			// Require cluster and manifest
			if (!clusterName || !manifest) {
				return reject("Cluster or Manifest not supplied for Elroy save");
			}

			// If NOT enabled skip processing
			if (!this.options.enabled) {
				return resolve();
			}

			// Save manifest to Elroy
			this.request({
				simple: true,
				method: "POST",
				uri: this.options.url + "/api/v1/deployment-environment",
				headers: {
					"X-Auth-Token": this.options.secret
				},
				body: {
					uuid: uuid,
					deploymentEnvironment: clusterName,
					service: manifest.metadata.name,
					type: (isRollback) ? "promotion" : "rollback",
					success: (error) ? false : true,
					error: error || null,
					manifest: manifest
				},
				json: true
			})
			.then((res) => {
				this.emit("debug", `Saved manifest for ${clusterName}/${manifest.metadata.name} to Elroy`);
				return resolve(res);
			})
			.catch((err) => {
				this.emit("warn", `Issue saving manifest for ${clusterName}/${manifest.metadata.name} to Elroy: ${err.message}`);
				return reject(err);
			});
			return null;
		});
	}
}

module.exports = Elroy;
