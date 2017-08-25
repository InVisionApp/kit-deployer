"use strict";

const _ = require("lodash");
const Annotations = require("../../annotator/annotations");
const Labels = require("../../annotator/labels");
const Utils = require("../utils");
const EventEmitter = require("events");

const Name = "fast-rollback";

// TODO: May want to make this configurable in the future
const NumDesiredReserve = 3;

class FastRollback extends EventEmitter {
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
    // If deployment manifest, append the deployId to the name
    const kind = manifest.kind.toLowerCase();
    var deployId = "unspecified";
    if (this.options.deployId) {
      deployId = this.options.deployId;
    }

    // Add ID label to deployment selector
    if (kind === "deployment") {
      // Initialize labels object if it doesn't have one yet
      if (!manifest.spec) {
        manifest.spec = {};
      }
      if (!manifest.spec.selector) {
        manifest.spec.selector = {};
      }
      if (!manifest.spec.selector.matchLabels) {
        manifest.spec.selector.matchLabels = {};
      }
      if (!manifest.spec.template) {
        manifest.spec.template = {};
      }
      if (!manifest.spec.template.metadata) {
        manifest.spec.template.metadata = {};
      }
      if (!manifest.spec.template.metadata.labels) {
        manifest.spec.template.metadata.labels = {};
      }
      if (
        !_.isUndefined(manifest.spec.selector.matchLabels[Labels.ID]) ||
        !_.isUndefined(manifest.spec.template.metadata.labels[Labels.ID])
      ) {
        throw new Error(
          `Reserved selector label ${Labels.ID} has been manually set on ${manifest
            .metadata.name}`
        );
      }
      manifest.metadata.name = `${manifest.metadata.name}-${deployId}`;
      manifest.spec.selector.matchLabels[Labels.ID] = deployId;
      manifest.spec.template.metadata.labels[Labels.ID] = deployId;
    }
    // Add ID label to service selector
    if (kind === "service") {
      // Initialize selector object if it doesn't have one yet
      if (!manifest.spec) {
        manifest.spec = {};
      }
      if (!manifest.spec.selector) {
        manifest.spec.selector = {};
      }
      if (!_.isUndefined(manifest.spec.selector[Labels.ID])) {
        throw new Error(
          `Reserved selector label ${Labels.ID} has been manually set on ${manifest
            .metadata.name}`
        );
      }
      manifest.spec.selector[Labels.ID] = deployId;
    }
    return manifest;
  }

  skipDeploy(manifest, found, differences) {
    const kind = manifest.kind.toLowerCase();
    if (kind === "deployment") {
      // Keep track of deployments because we will need to query for it later
      this.deployments.push({
        manifest: manifest
      });
      // If the deployment manifest already exists with the same deployId we will skip deploying it
      if (found) {
        this.emit(
          "info",
          `deployment ${manifest.metadata
            .name} already exists in the cluster so skipping`
        );
        return true;
      }
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

  allAvailable(manifests) {
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
        // Delete any deployments that are newer than the deployment we are using
        return this.deleteNewer();
      })
      .then(() => {
        // Delete excessive backups
        return this.deleteBackups();
      })
      .then(() => {
        return Utils.cleanup(this, this.deployments);
      });
  }

  deployServices() {
    let promises = [];
    // Verify the service's selector selects pods that are available, otherwise reject promise
    let selectors = [];
    _.each(this.services, service => {
      for (const prop in service.manifest.spec.selector) {
        selectors.push(`${prop}=${service.manifest.spec.selector[prop]}`);
      }
      const manifestName = service.manifest.metadata.name;
      const selectorString = selectors.join(",");
      promises.push(
        this.kubectl
          .list("pods", selectorString)
          .then(results => {
            // If there are results we are going to assume the selector is safe to deploy
            this.emit(
              "info",
              `verified ${results.items
                .length} pods match the service selector ${selectorString}`
            );
            if (!results.items.length) {
              throw new Error(
                `Service selector ${selectorString} does not match any pods, aborting deploy of service`
              );
            }
          })
          .then(() => {
            return this.kubectl.get("service", manifestName);
          })
          .then(result => {
            // If it does not have a last update annotation yet then continue
            if (
              !_.has(result, [
                "metadata",
                "annotations",
                Annotations.LastUpdated
              ])
            ) {
              return;
            }
            // Check if LastUpdated is newer than when this deploy started
            const currentServiceLastUpdated = new Date(
              result.metadata.annotations[Annotations.LastUpdated]
            ).getTime();
            const newServiceLastUpdated = new Date(
              service.manifest.metadata.annotations[Annotations.LastUpdated]
            ).getTime();
            if (currentServiceLastUpdated > newServiceLastUpdated) {
              throw new Error(
                "Aborting because current service has been updated since this deploy has started"
              );
            }
          })
          .then(() => {
            // Deploy service now
            return this.kubectl.apply(service.tmpPath).then(() => {
              this.emit(
                "info",
                `successfully deployed ${service.manifest.metadata
                  .name} service after all deployments were available`
              );
            });
          })
      );
    });
    return Promise.all(promises);
  }

  deleteNewer() {
    let promises = [];
    let flaggedForDeletion = [];
    _.each(this.deployments, deployment => {
      var creationTimestamp;
      var depSelectors = [];
      promises.push(
        this.kubectl
          .get("deployment", deployment.manifest.metadata.name)
          .then(result => {
            if (
              !_.has(result, ["metadata", "creationTimestamp"]) ||
              !result.metadata.creationTimestamp
            ) {
              throw new Error("Missing required creationTimestamp, aborting");
            }
            creationTimestamp = result.metadata.creationTimestamp;
            if (!result.metadata.labels[Labels.Name]) {
              throw new Error(
                `Missing required ${Labels.Name} label on deployment manifest ${deployment
                  .manifest.metadata.name}`
              );
            }
            if (!result.metadata.labels[Labels.ID]) {
              throw new Error(
                `Missing required ${Labels.ID} label on deployment manifest ${deployment
                  .manifest.metadata.name}`
              );
            }
            const depSelectorString = `${Labels.Name}=${result.metadata.labels[
              Labels.Name
            ]},${Labels.ID}!=${result.metadata.labels[
              Labels.ID
            ]},${Labels.Strategy}=${this.name}`;
            return this.kubectl
              .list("deployments", depSelectorString)
              .then(results => {
                let deletePromises = [];
                let verified = Utils.verifySameOriginalName(
                  results.items,
                  deployment.manifest
                );
                this.emit(
                  "info",
                  `deleteNewer found ${verified.length} deployments that match the ${deployment
                    .manifest.metadata
                    .name} deployment group label ${depSelectorString}`
                );
                // Only select deployments that are newer than the current deployment
                flaggedForDeletion = _.filter(verified, dep => {
                  return (
                    new Date(dep.metadata.creationTimestamp).getTime() >
                    new Date(creationTimestamp).getTime()
                  );
                });
                this.emit(
                  "info",
                  `attempting to delete ${flaggedForDeletion.length} deployments newer than ${deployment
                    .manifest.metadata.name}`
                );
                // Delete all deployments that are newer than the current deployment
                _.each(flaggedForDeletion, dep => {
                  deletePromises.push(
                    this.kubectl
                      .deleteByName("deployment", dep.metadata.name)
                      .then(() => {
                        this.emit(
                          "info",
                          `deleted newer deployment ${dep.metadata.name}`
                        );
                      })
                  );
                });
                return Promise.all(deletePromises).then(() => {
                  if (flaggedForDeletion.length) {
                    this.emit(
                      "info",
                      `successfully deleted ${flaggedForDeletion.length} deployments newer than ${deployment
                        .manifest.metadata.name}`
                    );
                  }
                });
              });
          })
      );
    });
    return Promise.all(promises).then(() => {
      return flaggedForDeletion;
    });
  }

  deleteBackups() {
    let promises = [];
    let flaggedForDeletion = [];
    _.each(this.deployments, deployment => {
      var creationTimestamp;
      var depSelectors = [];
      promises.push(
        this.kubectl
          .get("deployment", deployment.manifest.metadata.name)
          .then(result => {
            if (
              !_.has(result, ["metadata", "creationTimestamp"]) ||
              !result.metadata.creationTimestamp
            ) {
              throw new Error("Missing required creationTimestamp, aborting");
            }
            creationTimestamp = result.metadata.creationTimestamp;
            if (!result.metadata.labels[Labels.Name]) {
              throw new Error(
                `Missing required ${Labels.Name} label on deployment manifest ${deployment
                  .manifest.metadata.name}`
              );
            }
            if (!result.metadata.labels[Labels.ID]) {
              throw new Error(
                `Missing required ${Labels.ID} label on deployment manifest ${deployment
                  .manifest.metadata.name}`
              );
            }
            const depSelectorString = `${Labels.Name}=${result.metadata.labels[
              Labels.Name
            ]},${Labels.ID}!=${result.metadata.labels[
              Labels.ID
            ]},${Labels.Strategy}=${this.name}`;
            return this.kubectl
              .list("deployments", depSelectorString)
              .then(results => {
                let deletePromises = [];
                let verified = Utils.verifySameOriginalName(
                  results.items,
                  deployment.manifest
                );
                this.emit(
                  "info",
                  `deleteBackups found ${verified.length} backup deployments on reserve that match the ${deployment
                    .manifest.metadata
                    .name} deployment group label ${depSelectorString}`
                );
                // Sort the list by creationTimestamp
                verified.sort((a, b) => {
                  return (
                    new Date(a.metadata.creationTimestamp).getTime() -
                    new Date(b.metadata.creationTimestamp).getTime()
                  );
                });
                // Delete the oldest deployments while maintaining the desired backups on reserve
                if (verified.length - NumDesiredReserve > 0) {
                  flaggedForDeletion = verified.slice(
                    0,
                    verified.length - NumDesiredReserve
                  );
                  this.emit(
                    "info",
                    `attempting to delete ${flaggedForDeletion.length} deployments older than ${deployment
                      .manifest.metadata.name}`
                  );
                  // Extra check to make sure we don't delete more backups than required to be on reserve
                  if (
                    verified.length - flaggedForDeletion.length <
                    NumDesiredReserve
                  ) {
                    throw new Error(
                      `Trying to delete too many deployment backups, aborted`
                    );
                  }
                } else {
                  this.emit(
                    "info",
                    `skipping delete of older deployments because insufficent backup deployments on reserve`
                  );
                }
                _.each(flaggedForDeletion, dep => {
                  deletePromises.push(
                    this.kubectl
                      .deleteByName("deployment", dep.metadata.name)
                      .then(() => {
                        this.emit(
                          "info",
                          `deleted backup deployment ${dep.metadata.name}`
                        );
                      })
                  );
                });
                return Promise.all(deletePromises).then(() => {
                  if (flaggedForDeletion.length) {
                    this.emit(
                      "info",
                      `successfully deleted ${flaggedForDeletion.length} deployments older than ${deployment
                        .manifest.metadata.name}`
                    );
                  }
                });
              });
          })
      );
    });
    return Promise.all(promises).then(() => {
      return flaggedForDeletion;
    });
  }
}

module.exports = {
  Name: Name,
  Strategy: FastRollback
};
