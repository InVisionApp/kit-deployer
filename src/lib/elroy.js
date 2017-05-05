"use strict";

const _ = require("lodash");
const Promise = require("bluebird");
const EventEmitter = require("events");
const request = require("request-promise");

const Status = {
	get Success() { return "success"; },
	get Failure() { return "failure"; },
	get InProgress() { return "in-progress"; }
};

const Type = {
	get Rollback() { return "rollback"; },
	get Promotion() { return "promotion"; }
};

class Elroy extends EventEmitter {

	constructor(options) {
		super();
		this.options = _.merge({
			uuid: null,
			url: undefined,
			secret: undefined,
			enabled: false,
			isRollback: false
		}, options);
		this.request = request;
		this.emit("info", `Saving using Elroy is ${this.options.enabled}`);
	}

	/**
	 * Save manifest to Elroy when starting a deploy
	 *
	 * @param  {string} clusterName The cluster name
	 * @param  {string} resource    The resource name for the collection of manifests
	 * @param  {array}  manifests   An array of json manifests being deployed to the cluster
	 * @return {promise}            Promise that will resolve or reject
	 */
	start(clusterName, resource, manifests) {
		return this.send(Status.InProgress, clusterName, resource, manifests, null);
	}

	/**
	 * Send a failure message to elroy
	 *
	 * @param  {string} clusterName The cluster name
	 * @param  {string} resource    The resource name for the collection of manifests
	 * @param  {error}  error       The error message
	 * @return {promise}            Promise that will resolve or reject
	 */
	fail(clusterName, resource, error) {
		return this.send(Status.Failure, clusterName, resource, null, error);
	}

	/**
	 * Send a done message to elroy
	 *
	 * @param  {string} clusterName The cluster name
	 * @param  {string} resource    The resource name for the collection of manifests
	 * @return {promise}            Promise that will resolve or reject
	 */
	done(clusterName, resource) {
		return this.send(Status.Success, clusterName, resource, null, null);
	}

	send(status, clusterName, resource, manifests, error) {
		return new Promise((resolve, reject) => {
			// Require cluster and manifests
			if (!clusterName) {
				return reject("Cluster not supplied for Elroy save");
			}

			// If NOT enabled skip processing
			if (!this.options.enabled) {
				return resolve();
			}

			const body = {
				uuid: this.options.uuid,
				deploymentEnvironment: clusterName,
				service: resource,
				type: (this.options.isRollback) ? Type.Rollback : Type.Promotion,
				status: status
			};

			if (manifests) {
				body.manifests = manifests;
			}

			if (error) {
				body.error = error;
			}

			// Make request to Elroy
			this.request({
				simple: true,
				method: "PUT",
				uri: this.options.url + "/api/v1/deploy",
				headers: {
					"X-Auth-Token": this.options.secret
				},
				body: body,
				json: true
			})
			.then((res) => {
				this.emit("debug", `Saved manifest for ${clusterName}/${resource} to Elroy`);
				return resolve(res);
			})
			.catch((err) => {
				this.emit("warn", `Issue saving manifest for ${clusterName}/${resource} to Elroy: ${err.message}`);
				return reject(err);
			});
			return null;
		});
	}
}

module.exports = {
	Elroy: Elroy,
	Status: Status,
	Type: Type
};
