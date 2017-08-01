"use strict";

const _ = require("lodash");
const crypto = require("crypto");
const Annotations = require("./annotations");
const Strategy = require("../strategy").Strategy;

const mustBeUnique = [
	"Job",
	"ScheduledJob",
	"CronJob"
];

class Annotator {
	constructor(options) {
		this.start = new Date();
		this.options = _.merge({
			uuid: undefined,
			sha: undefined,
			strategy: undefined
		}, options);

		if (!(this.options.strategy instanceof Strategy)) {
			throw new Error("Invalid strategy provided to annotator");
		}
	}

	/**
	 * Add the required manifest annotations and rename the manifest depending on it's type
	 *
	 * @param  {object} manifest     The manifest content
	 * @return {object}              Contains the annotated manifest and the tmp file path
	 */
	annotate(manifest) {
		// Save configuration we're applying as metadata annotation so we can diff against
		// on future configuration changes
		var applyingConfiguration = JSON.stringify(manifest);
		var applyingConfigurationHash = crypto.createHash("sha1").update(applyingConfiguration, "utf8").digest("hex");

		// To avoid issues with deleting/creating jobs, we instead create a new job with a unique name that is based
		// on the contents of the manifest
		var manifestName = manifest.metadata.name;
		if (mustBeUnique.indexOf(manifest.kind) >= 0) {
			manifestName = manifest.metadata.name + "-" + applyingConfigurationHash;
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

		// Update manifest name before deploying (necessary for manifests we need to give a unique name to like Jobs)
		manifest.metadata.annotations[Annotations.OriginalName] = manifest.metadata.name;
		manifest.metadata.name = manifestName;

		// Add our custom annotations before deploying
		manifest.metadata.annotations[Annotations.LastAppliedConfiguration] = applyingConfiguration;
		manifest.metadata.annotations[Annotations.LastAppliedConfigurationHash] = applyingConfigurationHash;

		// Add commit annotation to manifest we are creating/updating
		manifest.metadata.annotations[Annotations.Commit] = JSON.stringify(this.options.sha);

		// Add updated unix timestamp
		manifest.metadata.annotations[Annotations.LastUpdated] = this.start.toISOString();

		// Apply any strategy annotations
		manifest = this.options.strategy.annotate(manifest);

		return manifest;
	}
}

module.exports = Annotator;
