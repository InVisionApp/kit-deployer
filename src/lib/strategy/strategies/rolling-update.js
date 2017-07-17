"use strict";

const EventEmitter = require("events");

const Name = "rolling-update"

class RollingUpdate extends EventEmitter {
	constructor(options) {
		super();
		this.options = options;
	}

	get name() {
		return Name;
	}

	annotate(manifest) {
		return manifest;
	}

	skipDeploy(manifest, found, differences) {
		if (!differences) {
			return true;
		}
		return false;
	}

	preDeploy(manifest, found, differences, tmpApplyingConfigurationPath) {
		return Promise.resolve(false);
	}

	allAvailable(manifests) {
		return Promise.resolve();
	}
}

module.exports = {
	Name: Name,
	Strategy: RollingUpdate
};
