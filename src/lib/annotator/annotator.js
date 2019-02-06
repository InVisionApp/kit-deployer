"use strict";

const _ = require("lodash");
const crypto = require("crypto");
const generate = require("nanoid/generate");

const Annotations = require("./annotations");
const Labels = require("./labels");
const Strategy = require("../strategy").Strategy;

const mustBeUnique = ["Job"];

class Annotator {
  constructor(options) {
    this.start = new Date();
    this.options = _.merge(
      {
        uuid: undefined,
        releaseId: undefined,
        tierDeploymentId: undefined,
        sha: undefined,
        strategy: undefined,
        deployId: undefined,
        raw: false,
        resource: undefined
      },
      options
    );

    if (!(this.options.strategy instanceof Strategy)) {
      throw new Error("Invalid strategy provided to annotator");
    }
  }

  get deployId() {
    if (this.options.deployId) {
      return this.options.deployId;
    }
    return "unspecified";
  }

  /**
	 * Add the required manifest annotations and rename the manifest depending on it's type
	 *
	 * @param  {object} manifest     The manifest content
	 * @return {object}              Contains the annotated manifest and the tmp file path
	 */
  annotate(manifest) {
    // Do not annotate if raw manifest given
    if (this.options.raw) {
      // Initialize annotations object if it doesn't have one yet
      if (!manifest.metadata) {
        manifest.metadata = {};
      }
      if (!manifest.metadata.annotations) {
        manifest.metadata.annotations = {};
      }
      if (this.options.uuid) {
        manifest.metadata.annotations[Annotations.UUID] = this.options.uuid;
      }
      return manifest;
    }

    // Save configuration we're applying as metadata annotation so we can diff against
    // on future configuration changes
    var applyingConfiguration = JSON.stringify(manifest);
    var applyingConfigurationHash = crypto
      .createHash("sha1")
      .update(applyingConfiguration, "utf8")
      .digest("hex");

    var manifestName = manifest.metadata.name;

    // To avoid issues with deleting/creating jobs,
    // we instead create a new job adding a shortID suffix.
    // The job suffix must start and end with an alphanumeric character.
    if (mustBeUnique.indexOf(manifest.kind) >= 0) {
      manifestName =
        manifest.metadata.name + "-" + generate("1234567890abcdef", 10);
    }

    // Initialize annotations object if it doesn't have one yet
    if (!manifest.metadata) {
      manifest.metadata = {};
    }
    if (!manifest.metadata.annotations) {
      manifest.metadata.annotations = {};
    }

    // Add UUID as annotation
    if (this.options.uuid) {
      manifest.metadata.annotations[Annotations.UUID] = this.options.uuid;
    }

    // Add release-id annotation
    if (this.options.releaseId) {
      manifest.metadata.annotations[
        Annotations.ReleaseID
      ] = this.options.releaseId;
    }

    // Add tierDeploymentId annotation
    if (this.options.tierDeploymentId) {
      manifest.metadata.annotations[
        Annotations.TierDeploymentID
      ] = this.options.tierDeploymentId;
    }

    // Update manifest name before deploying (necessary for manifests we need to give a unique name to like Jobs)
    manifest.metadata.annotations[Annotations.OriginalName] =
      manifest.metadata.name;
    manifest.metadata.name = manifestName;

    // Add our custom annotations before deploying
    manifest.metadata.annotations[
      Annotations.LastAppliedConfiguration
    ] = applyingConfiguration;
    manifest.metadata.annotations[
      Annotations.LastAppliedConfigurationHash
    ] = applyingConfigurationHash;

    // Add commit annotation to manifest we are creating/updating
    manifest.metadata.annotations[Annotations.Commit] = JSON.stringify(
      this.options.sha
    );

    // Add updated unix timestamp
    manifest.metadata.annotations[
      Annotations.LastUpdated
    ] = this.start.toISOString();

    // Add dynamic labels
    manifest = this.labels(manifest);

    // Add dynamic selector matchLabels
    manifest = this.selectors(manifest);

    // Apply any strategy annotations
    manifest = this.options.strategy.annotate(manifest);

    return manifest;
  }

  labels(manifest) {
    // Initialize labels object if it doesn't have one yet
    if (!manifest.metadata) {
      manifest.metadata = {};
    }
    if (!manifest.metadata.labels) {
      manifest.metadata.labels = {};
    }

    // Add deploy ID label
    if (!_.isUndefined(manifest.metadata.labels[Labels.ID])) {
      throw new Error(
        `Reserved metadata.label ${Labels.ID} has been manually set on ${manifest
          .metadata.name}`
      );
    }
    manifest.metadata.labels[Labels.ID] = this.deployId;

    // Add resource label if not present
    if (
      _.isUndefined(manifest.metadata.labels["resource"]) &&
      this.options.resource
    ) {
      manifest.metadata.labels["resource"] = this.options.resource;
    }

    // Require name label for deployments
    if (manifest.kind == "Deployment") {
      if (_.isUndefined(manifest.metadata.labels[Labels.Name])) {
        throw new Error(
          `Required metadata.label ${Labels.Name} must be manually set on ${manifest
            .metadata.name}`
        );
      }
    }

    // Add strategy name label
    if (!_.isString(this.options.strategy.name)) {
      throw new Error(
        `Requires string strategyName for reserved label ${Labels.Strategy}`
      );
    }
    manifest.metadata.labels[Labels.Strategy] = this.options.strategy.name;

    return manifest;
  }

  selectors(manifest) {
    // Add reserved selectors if needed
    if (manifest.kind == "Deployment") {
      // Initialize selector object if it doesn't have one yet
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

      // Set the strategy on the labels
      manifest.spec.template.metadata.labels[
        Labels.Strategy
      ] = this.options.strategy.name;

      // If no selector, make the selector the same as the spec.template.metadata labels
      if (_.isEmpty(manifest.spec.selector.matchLabels)) {
        manifest.spec.selector.matchLabels =
          manifest.spec.template.metadata.labels;
      }

      // Set the strategy on the selector
      manifest.spec.selector.matchLabels[
        Labels.Strategy
      ] = this.options.strategy.name;

      // If no name on selector yet, set it to the same name as the template metadata label
      if (_.isUndefined(manifest.spec.selector.matchLabels[Labels.Name])) {
        // Set the name on the selector
        manifest.spec.selector.matchLabels[Labels.Name] =
          manifest.spec.template.metadata.labels[Labels.Name];
      }

      // If no name on labels yet, set it to the same name as the selector
      if (_.isUndefined(manifest.spec.template.metadata.labels[Labels.Name])) {
        // Set the name on the selector
        manifest.spec.template.metadata.labels[Labels.Name] =
          manifest.spec.selector.matchLabels[Labels.Name];
      }

      // Require name label AND selector for deployment spec template
      if (
        _.isUndefined(manifest.spec.template.metadata.labels[Labels.Name]) &&
        _.isUndefined(manifest.spec.selector.matchLabels[Labels.Name])
      ) {
        throw new Error(
          `Required spec.template.metadata.labels or spec.selector.matchLabels ${Labels.Name} must be manually set on ${manifest
            .metadata.name}`
        );
      }

      // The name label should match the selector label
      if (
        manifest.metadata.labels[Labels.Name] !=
        manifest.spec.selector.matchLabels[Labels.Name]
      ) {
        throw new Error(
          `The ${Labels.Name}=${manifest.metadata.labels[
            Labels.Name
          ]} does not match selector ${Labels.Name}=${manifest.spec.selector
            .matchLabels[Labels.Name]} on ${manifest.metadata.name}`
        );
      }
    } else if (manifest.kind == "Service") {
      // Initialize selector object if it doesn't have one yet
      if (!manifest.spec) {
        manifest.spec = {};
      }
      if (!manifest.spec.selector) {
        manifest.spec.selector = {};
      }
      // Require name label for service selectors
      if (_.isUndefined(manifest.spec.selector[Labels.Name])) {
        throw new Error(
          `Required spec.selector ${Labels.Name} must be manually set on ${manifest
            .metadata.name}`
        );
      }
      if (!_.isUndefined(manifest.spec.selector[Labels.Strategy])) {
        throw new Error(
          `Reserved spec.selector ${Labels.Strategy} has been manually set on ${manifest
            .metadata.name}`
        );
      }
      manifest.spec.selector[Labels.Strategy] = this.options.strategy.name;
    }
    return manifest;
  }
}

module.exports = Annotator;
