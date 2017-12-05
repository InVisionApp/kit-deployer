"use strict";

const _ = require("lodash");
const Utils = require("../utils");
const EventEmitter = require("events");

const Name = "rolling-update";

class RollingUpdate extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.kubectl = this.options.kubectl;
    this.services = [];
    this.deployments = [];
  }

  get name() {
    return Name;
  }

  annotate(manifest) {
    return manifest;
  }

  skipDeploy(manifest, found, differences) {
    const kind = manifest.kind.toLowerCase();
    if (kind === "deployment") {
      // Keep track of deployments because we will need to query for it later
      this.deployments.push({
        manifest: manifest
      });
    }

    if (!differences) {
      return true;
    }
    return false;
  }

  preDeploy(manifest, found, differences, tmpApplyingConfigurationPath) {
    const kind = manifest.kind.toLowerCase();
    // Postpone deploy of any services that are NOT new because we want to wait for the deployment to be available first
    if (kind === "service") {
      // If the service is NOT found we will simply deploy the service immediately (no need to wait)
      if (!found) {
        return Promise.resolve(false);
      }
      this.emit(
        "info",
        `waiting for all deployments to be available before deploying service ${manifest
          .metadata.name}`
      );
      this.services.push({
        manifest: manifest,
        tmpPath: tmpApplyingConfigurationPath
      });
      return Promise.resolve(true);
    }

    return Promise.resolve(false);
  }

  allAvailable() {
    // Deployment manifests are available and we can deploy the services now
    return this.deployServices()
      .then(() => {
        this.emit(
          "info",
          `deployed ${this.services
            .length} services after all deployments available`
        );
      })
      .then(() => {
        if (this.options.dryRun) {
          this.emit("info", "DryRun is enabled: skipping cleanup");
          return Promise.resolve();
        }
        return Utils.cleanup(this, this.deployments);
      });
  }

  deployServices() {
    let promises = [];
    _.each(this.services, service => {
      promises.push(
        this.kubectl.apply(service.tmpPath).then(() => {
          this.emit(
            "info",
            `successfully deployed ${service.manifest.metadata
              .name} service after all deployments were available`
          );
        })
      );
    });
    return Promise.all(promises);
  }
}

module.exports = {
  Name: Name,
  Strategy: RollingUpdate
};
