"use strict";

const _ = require("lodash");
const EventEmitter = require("events").EventEmitter;
const EventError = require("../util/event-error");

const errorReasons = [
	"NodeOutOfDisk",
	"BackOff",
	"ImagePullBackOff",
	"FailedSync",
	"MissingClusterDNS",
	"NodeNotSchedulable"
];
const excludeReasons = [
	"Unhealthy" // We ignore unhealthy events because often services can fail checks on startup/terminating and cause false positives
];

/**
 * @fires HealthCheck#debug
 * @fires HealthCheck#error
 */
class HealthCheck extends EventEmitter {
	constructor(kubectl, gracePeriod, since) {
		super();
		this.events = kubectl.events(since);
		this.errorTimeoutId = null;
		this.gracePeriod = (typeof gracePeriod === "undefined") ? 10 * 1000 : gracePeriod * 1000; // 10 seconds
	}

	start(name) {
		this.events.on("new", (event) => {
			if (!_.has(event, ["type"])) {
				return;
			}
			if (!_.has(event, ["reason"]) || !_.isString(event.reason)) {
				return;
			}

			// Only concern ourselves with events that match name
			if (!(_.has(event, ["involvedObject", "name"]) && event.involvedObject.name.startsWith(name))) {
				return;
			}

			// Skip reasons that are excluded from checking
			if (excludeReasons.indexOf(event.reason) >= 0) {
				return;
			}

			if (event.type != "Normal" || errorReasons.indexOf(event.reason) >= 0) {
				// We only care about the first error we receive, ignore any errors afterwards
				if (this.error.timeoutId === null) {
					// Emit error unless stop is called before grace period expires
					this.emit("debug", "Healthcheck detected " + event.reason + " error for " + event.involvedObject.name + ", waiting grace period " + this.gracePeriod + "ms before emitting");
					this.errorTimeoutId = setTimeout(() => {
						this.emit("debug", "Healthcheck grace period of " + this.gracePeriod + "ms expired");
						this.emit("error", new EventError(event));
					}, this.gracePeriod);
				}
			}
		});
		this.events.start();
	}

	stop() {
		this.emit("debug", "Stopping healthcheck watcher");
		this.events.stop();
		if (this.errorTimeoutId !== null) {
			this.emit("debug", "Clearing healthcheck timeout");
			clearTimeout(this.errorTimeoutId);
		}
		this.removeAllListeners();
	}
}

module.exports = HealthCheck;
