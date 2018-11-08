"use strict";

const _ = require("lodash");
const Annotations = require("../annotator/annotations");
const Labels = require("../annotator/labels");

class Utils {
  static cleanup(strategy, deployments) {
    let promises = [];
    let flaggedForDeletion = [];
    _.each(deployments, deployment => {
      promises.push(
        strategy.kubectl
          .get("deployment", deployment.manifest.metadata.name)
          .then(result => {
            if (!result.metadata.labels[Labels.Name]) {
              throw new Error(
                `Missing required ${Labels.Name} label on deployment manifest ${deployment
                  .manifest.metadata.name}`
              );
            }
            if (!result.metadata.labels[Labels.Strategy]) {
              throw new Error(
                `Missing required ${Labels.Strategy} label on deployment manifest ${deployment
                  .manifest.metadata.name}`
              );
            }
            const depSelectorString = `${Labels.Name}=${result.metadata.labels[
              Labels.Name
            ]},${Labels.Strategy}!=${result.metadata.labels[Labels.Strategy]}`;
            const rsSelectorString = `${Labels.Name}=${result.metadata.labels[
              Labels.Name
            ]}`;
            return strategy.kubectl
              .list("deployments", depSelectorString)
              .then(results => {
                let deletePromises = [];
                let flaggedForDeletion = Utils.verifySameOriginalName(
                  results.items,
                  deployment.manifest
                );
                strategy.emit(
                  "info",
                  `cleanup attempting to delete ${flaggedForDeletion.length} deployments that match the ${deployment
                    .manifest.metadata
                    .name} deployment group label ${depSelectorString}`
                );
                _.each(flaggedForDeletion, dep => {
                  deletePromises.push(
                    strategy.kubectl
                      .deleteByName("deployment", dep.metadata.name)
                      .then(() => {
                        strategy.emit(
                          "info",
                          `cleanup deleted deployment ${dep.metadata.name}`
                        );
                      })
                  );
                });
                return Promise.all(deletePromises).then(() => {
                  if (flaggedForDeletion.length) {
                    strategy.emit(
                      "info",
                      `cleanup successfully deleted ${flaggedForDeletion.length} deployments`
                    );
                  }
                });
              })
              .then(() => {
                return strategy.kubectl
                  .list("replicasets", rsSelectorString)
                  .then(results => {
                    let filteredResults = Utils.findNonMatchingReplicasets(
                      result.spec.selector.matchLabels,
                      results.items
                    );
                    let deletePromises = [];
                    let flaggedForDeletion = Utils.verifySameOriginalName(
                      filteredResults,
                      deployment.manifest
                    );
                    strategy.emit(
                      "info",
                      `cleanup attempting to delete ${flaggedForDeletion.length} replicasets that don't match the ${deployment
                        .manifest.metadata.name} deployment selector`
                    );
                    _.each(flaggedForDeletion, dep => {
                      deletePromises.push(
                        strategy.kubectl
                          .deleteByName("replicaset", dep.metadata.name)
                          .then(() => {
                            strategy.emit(
                              "info",
                              `cleanup deleted replicaset ${dep.metadata.name}`
                            );
                          })
                          .catch(err => {
                            strategy.emit(
                              "warn",
                              `cleanup unable to delete replicaset ${dep
                                .metadata.name}: ${err}`
                            );
                          })
                      );
                    });
                    return Promise.all(deletePromises).then(() => {
                      if (flaggedForDeletion.length) {
                        strategy.emit(
                          "info",
                          `cleanup successfully deleted ${flaggedForDeletion.length} replicasets`
                        );
                      }
                    });
                  });
              });
          })
      );
    });
    return Promise.all(promises).then(() => {
      return flaggedForDeletion;
    });
  }

  /**
   * This will filter any Replica Sets that don't match the provided selector
   * labels
   * @param {object} deployedSelectorLabels - selector labels object for filtering replicasets
   * @param {array} items - replicaset objects from kubernetes
   * @returns {array} - returns a filtered array of kubernetes replicaset objects
   */
  static findNonMatchingReplicasets(deployedSelectorLabels, items) {
    let replicasetReducer = Utils.rsNonMatchingFilterFn(deployedSelectorLabels);
    let filteredItems = items.filter(replicasetReducer);
    return filteredItems;
  }

  /**
   * Returns a function that will filter replicasets using the selector labels map
   * the returned function expects a valid kubernetes replicaset object
   * @param {object} deployedSelectorLabels - selector labels object for filtering replicasets
   * @returns {boolean} - whether or not the selector passes
   */
  static rsNonMatchingFilterFn(deployedSelectorLabels) {
    return function(item) {
      // If the name label doesn't match then we should immediately filter
      // since this most likely wasn't generated by the same deployment controller
      if (
        item.metadata.labels[Labels.Name] !==
        deployedSelectorLabels[Labels.Name]
      ) {
        return false;
      }

      if (
        item.metadata.labels[Labels.Strategy] !==
        deployedSelectorLabels[Labels.Strategy]
      ) {
        return true;
      }

      let nonMatching = false;
      for (let label in deployedSelectorLabels) {
        if (!item.metadata.labels[label]) {
          nonMatching = true;
        }
      }
      return nonMatching;
    };
  }

  // VerifySameOriginalName will take the given results and make sure they all match the original name of the manifest given
  static verifySameOriginalName(items, manifest) {
    var verified = [];
    // Exclude the current active deployment
    if (!_.has(manifest, ["metadata", "name"]) && !manifest.metadata.name) {
      throw new Error(`Deployment is missing it's name... huh?!`);
    }
    verified = _.reject(items, {
      metadata: {
        name: manifest.metadata.name
      }
    });

    // Verify these deployments have the same original name as this deployment (just in case the
    // label selector isn't safe enough)
    if (
      !_.has(manifest, ["metadata", "annotations", Annotations.OriginalName]) &&
      !manifest.metadata.annotations[Annotations.OriginalName]
    ) {
      throw new Error(
        `Deployment ${manifest.metadata
          .name} is missing it's original name annotation`
      );
    }
    verified = _.filter(verified, dep => {
      if (_.has(dep, ["metadata", "annotations", Annotations.OriginalName])) {
        return (
          dep.metadata.annotations[Annotations.OriginalName] ==
          manifest.metadata.annotations[Annotations.OriginalName]
        );
      }
      return false;
    });
    return verified;
  }
}

module.exports = Utils;
