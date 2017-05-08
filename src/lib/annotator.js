"use strict";

const _ = require("lodash");
const crypto = require("crypto");

const mustBeUnique = [
	"Job",
	"ScheduledJob",
	"CronJob"
];

const Annotations = {
	get Commit() {
		return "kit-deployer/commit";
	},
	get OriginalName() {
		return "kit-deployer/original-name";
	},
	get LastAppliedConfiguration() {
		return "kit-deployer/last-applied-configuration";
	},
	get LastAppliedConfigurationHash() {
		return "kit-deployer/last-applied-configuration-sha1";
	}
};

class Annotator {
	constructor(options) {
		this.options = _.merge({
			sha: undefined
		}, options);
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

		// Update manifest name before deploying (necessary for manifests we need to give a unique name to like Jobs)
		manifest.metadata.annotations[Annotations.OriginalName] = manifest.metadata.name;
		manifest.metadata.name = manifestName;

		// Add our custom annotations before deploying
		manifest.metadata.annotations[Annotations.LastAppliedConfiguration] = applyingConfiguration;
		manifest.metadata.annotations[Annotations.LastAppliedConfigurationHash] = applyingConfigurationHash;

		// Add commit annotation to manifest we are creating/updating
		manifest.metadata.annotations[Annotations.Commit] = JSON.stringify(this.options.sha);

		return manifest;
	}
}

module.exports = {
	Annotator: Annotator,
	Annotations: Annotations
};
