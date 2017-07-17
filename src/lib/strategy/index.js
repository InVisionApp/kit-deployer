"use strict";

const EventEmitter = require("events");
const FastRollback = require("./strategies/fast-rollback");
const RollingUpdate = require("./strategies/rolling-update");

const Strategies = {
	get FastRollback() { return FastRollback.Name; },
	get RollingUpdate() { return RollingUpdate.Name; },
};

class Strategy extends EventEmitter {
	constructor(name, options) {
		super();
		switch (name) {
			case Strategies.RollingUpdate:
				this._strategy = new RollingUpdate.Strategy(options);
				break;
			case Strategies.FastRollback:
				this._strategy = new FastRollback.Strategy(options);
				break;
		}
		if (!this._strategy) {
			throw new Error(`Invalid strategy provided: ${name}`);
		}
		this._strategy.on("info", (msg) => {
			this.emit("info", "Strategy " + this.name + " " + msg);
		})
	}

	get name() {
		return this._strategy.name;
	}

	// Annotate is used to do any special annotations on top of the default annotations made to the manifest before the
	// deploy is started. It returns the manifest updated manifest.
	annotate(manifest) {
		this._strategy.emit("info", "annotating " + manifest.metadata.name);
		return this._strategy.annotate(manifest);
	}

	// SkipDeploy is given the manifest that is just about to be deployed and should return true if the deploy should
	// continue or false otherwise.
	skipDeploy(manifest, found, differences) {
		return this._strategy.skipDeploy(manifest, found, differences);
	}

	// PreDeploy is given the manifest that is just about to be deployed and should return a promise that must resolve
	// for the deploy to continue.
	preDeploy(manifest, found, differences, tmpApplyingConfigurationPath) {
		return this._strategy.preDeploy(manifest, found, differences, tmpApplyingConfigurationPath);
	}

	// AllAvailable is given all the annotated manifests and is fired after all manifests are available for the cluster.
	// Will return a promise that must resolve for the lifecycle to continue.
	allAvailable(manifests) {
		this._strategy.emit("info", "all " + manifests.length + " manifests are available");
		return this._strategy.allAvailable(manifests);
	}
}

module.exports = {
	Strategies: Strategies,
	Strategy: Strategy
};
