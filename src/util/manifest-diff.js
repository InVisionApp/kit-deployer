"use strict";

const _ = require("lodash");
const traverse = require("traverse");
const diff = require("deep-diff");
const Annotations = require("../lib/annotator/annotations");

/*
 * Given a manifest object it will search for any Arrays
 * and if those Arrays contain objects with the `name` property, it will
 * convert the Array to an Object with the value of the `name` property
 * being the key.
 */
function indexArraysByName(manifest) {
	traverse(manifest).forEach(function(x) {
		if (_.isArray(x)) {
			let hasNameObjects = false;
			const updated = _.mapKeys(x, function(value, key) {
				if (_.has(value, ["name"])) {
					hasNameObjects = true;
					return value.name;
				}
				return key;
			});
			if (hasNameObjects) {
				this.update(updated);
			}
		}
	});
}

/*
 * Will intelligently show the difference between two manifest files
 */
function manifestDiff(previous, latest) {
	const previousClone = _.cloneDeep(previous);
	const latestClone = _.cloneDeep(latest);

	// Remove special annotations from latest that are used for diff logic
	if (_.has(latest, ["metadata", "annotations"])) {
		// We want to use the original name before performing the diff (if one is found)
		if (latestClone.metadata.annotations[Annotations.OriginalName]) {
			latestClone.metadata.name = latestClone.metadata.annotations[Annotations.OriginalName];
		}
		// All these annotations are dynamically generated and thus should not be diffed
		delete latestClone.metadata.annotations[Annotations.OriginalName];
		delete latestClone.metadata.annotations[Annotations.LastAppliedConfiguration];
		delete latestClone.metadata.annotations[Annotations.LastAppliedConfigurationHash];
		delete latestClone.metadata.annotations[Annotations.Commit];
		// If there are no other annotations remove the annotation block to prevent a false diff
		if (Object.keys(latestClone.metadata.annotations).length == 0) {
			delete latestClone.metadata.annotations;
		}
	}

	indexArraysByName(previousClone);
	indexArraysByName(latestClone);

	return diff(previousClone, latestClone);
}

module.exports = manifestDiff;
