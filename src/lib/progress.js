"use strict";

const EventEmitter = require("events");
const _ = require("lodash");

class Progress extends EventEmitter {
	constructor(options) {
		super();
		this._status = {
			clusters: {
				total: 0,
				completed: 0,
				found: [],
				remaining: [],
				successful: [],
				failed: []
			}
		};
	}

	// Update and emit the current progress
	status() {
		return {
			percent: this._status.clusters.completed / this._status.clusters.total,
			clusters: this._status.clusters
		};
	}

	add(cluster) {
		if (typeof cluster != "string") {
			throw new Error(`Cluster given to progress has to be string: ${cluster}`);
		}
		this._status.clusters.total++;
		this._status.clusters.found.push(cluster);
		this._status.clusters.remaining.push(cluster);
	}

	success(cluster) {
		if (typeof cluster != "string") {
			throw new Error(`Cluster given to progress has to be string: ${cluster}`);
		}
		this._status.clusters.completed++;
		this._status.clusters.successful.push(cluster);
		this._status.clusters.remaining = _.without(this._status.clusters.remaining, cluster);
		this.emit("progress", this.status());
	}

	fail(cluster) {
		if (typeof cluster != "string") {
			throw new Error(`Cluster given to progress has to be string: ${cluster}`);
		}
		this._status.clusters.completed++;
		this._status.clusters.failed.push(cluster);
		this._status.clusters.remaining = _.without(this._status.clusters.remaining, cluster);
		this.emit("progress", this.status());
	}
}

module.exports = Progress;
