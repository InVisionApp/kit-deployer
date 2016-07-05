"use strict";

const _ = require("lodash");
const traverse = require("traverse");
const diff = require("deep-diff");

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

	indexArraysByName(previousClone);
	indexArraysByName(latestClone);

	return diff(previousClone, latestClone);
}

module.exports = manifestDiff;
