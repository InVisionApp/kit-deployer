"use strict";

const _ = require("lodash");
const Promise = require("bluebird");
const EventEmitter = require("events");
const request = require("request-promise");
const yaml = require("js-yaml");

const Status = {
  get Success() {
    return "success";
  },
  get Failure() {
    return "failure";
  },
  get InProgress() {
    return "in-progress";
  }
};

const Type = {
  get Rollback() {
    return "rollback";
  },
  get Promotion() {
    return "promotion";
  }
};

class Elroy extends EventEmitter {
  constructor(options) {
    super();
    this.options = _.merge(
      {
        uuid: null,
        url: undefined,
        secret: undefined,
        enabled: false,
        isRollback: false,
        clusterName: undefined,
        resource: undefined
      },
      options
    );
    this.request = request;
    this.emit("info", `Saving using Elroy is ${this.options.enabled}`);
  }

  /**
	 * Save manifest to Elroy when starting a deploy
	 *
	 * @param  {array}  manifests   An array of json manifests being deployed to the cluster
	 * @return {promise}            Promise that will resolve or reject
	 */
  start(manifests) {
    if (!this.options.enabled) {
      this.emit("info", "Elroy is not enabled, skipping...");
      return Promise.resolve();
    }
    // Skip starting if there are no manifests being deployed
    if (!manifests) {
      this.emit(
        "debug",
        `No manifests to deploy for ${this.options.clusterName}/${this.options
          .resource}`
      );
      return Promise.resolve();
    }
    this._started = true;
    return this.send(Status.InProgress, manifests, null);
  }

  /**
	 * Send a failure message to elroy
	 *
	 * @param  {error}  error       The error message
	 * @return {promise}            Promise that will resolve or reject
	 */
  fail(error) {
    return this.send(Status.Failure, null, error);
  }

  /**
	 * Send a done message to elroy
	 *
	 * @return {promise}            Promise that will resolve or reject
	 */
  done() {
    return this.send(Status.Success, null, null);
  }

  send(status, manifests, error) {
    return new Promise((resolve, reject) => {
      // Require status
      if (!status) {
        return reject("Status not supplied for Elroy");
      }

      // Skip sending if it has not been started yet
      if (!this._started) {
        return resolve();
      }

      // Require cluster
      if (!this.options.clusterName) {
        return reject("Cluster not supplied for Elroy");
      }

      // Require resource
      if (!this.options.resource) {
        return reject("Resource not supplied for Elroy");
      }

      // If NOT enabled skip processing
      if (!this.options.enabled) {
        return resolve();
      }

      const body = {
        uuid: this.options.uuid,
        deploymentEnvironment: this.options.clusterName,
        service: this.options.resource,
        type: this.options.isRollback ? Type.Rollback : Type.Promotion,
        status: status
      };

      if (manifests) {
        // Convert json manifests to yaml before sending
        var yamlManifests = [];
        _.each(manifests, jsonManifest => {
          yamlManifests.push(
            yaml.safeDump(jsonManifest, {
              sortKeys: true
            })
          );
        });
        body.manifests = yamlManifests;
      }

      if (error) {
        body.error = error;
      }

      // Make request to Elroy
      const uri = this.options.url + "/api/v1/deploy";
      this.request({
        simple: true,
        method: "PUT",
        uri: uri,
        headers: {
          "X-Auth-Token": this.options.secret
        },
        body: body,
        json: true
      })
        .then(res => {
          this.emit(
            "info",
            `Successfully updated ${this.options.clusterName}/${this.options
              .resource} in Elroy`
          );
          return resolve(res);
        })
        .catch(err => {
          this.emit(
            "warn",
            `Error updating ${this.options.clusterName}/${this.options
              .resource} in Elroy: ${err.message}`
          );
          const bodyStr = JSON.stringify(body);
          this.emit(
            "debug",
            `Error updating ${this.options.clusterName}/${this.options
              .resource} in Elroy to ${uri} with payload: ${bodyStr}`
          );
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
