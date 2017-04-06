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
		this.error = {
			timeoutId: null,
			involvedObjectName: null
		};
		this.beingKilled = [];
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

			// Ignore events for involved objects that are being killed
			if (this.beingKilled.indexOf(event.involvedObject.name) >= 0) {
				if (this.error.involvedObjectName == event.involvedObject.name) {
					this.emit("debug", "Clearing healthcheck timeout because " + event.involvedObject.name + " is being killed");
					clearTimeout(this.error.timeoutId);
				}
				return;
			}

			// If we encounter a Killing event for any involvedObject we should not care about it's health
			// A "Killing" event is of type "Normal" and means that a pod is purposefully being killed
			if (event.reason == "Killing") {
				this.beingKilled.push(event.involvedObject.name);
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
					this.error.involvedObjectName = event.involvedObject.name;
					this.error.timeoutId = setTimeout(() => {
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
		if (this.error.timeoutId !== null) {
			this.emit("debug", "Clearing healthcheck timeout");
			clearTimeout(this.errorTimeoutId);
		}
		this.removeAllListeners();
	}
}

module.exports = HealthCheck;
