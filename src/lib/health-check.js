"use strict";

const _ = require("lodash");
const EventEmitter = require("events").EventEmitter;

class HealthCheck extends EventEmitter {
	constructor(kubectl, gracePeriod) {
		super();
		this.events = kubectl.events();
		this.errorEvents = {};
		this.gracePeriod = (typeof gracePeriod === "undefined") ? 10 * 1000 : gracePeriod * 1000; // 10 seconds
	}

	start(name) {
		this.events.on("new", (event) => {
			if (!_.has(event, ["type"])) {
				return;
			}

			// Only concern ourselves with events that match name
			if (!(_.has(event, ["involvedObject", "name"]) && event.involvedObject.name.startsWith(name))) {
				return;
			}

			if (event.type != "Normal") {
				// If the involved object doesn't show a normal event within gracePeriod, throw error
				if (_.has(event, ["involvedObject", "uid"])) {
					if (!this.errorEvents[event.involvedObject.uid]) {
						this.errorEvents[event.involvedObject.uid] = [];
					}
					this.errorEvents[event.involvedObject.uid].push(setTimeout(() => {
						this.emit("error", event);
					}, this.gracePeriod));
				}
			} else {
				// If the involved object has shown an error before, let's disregard it as a newer event
				// shows Normal so assume it automatically recovered within the gracePeriod time
				if (_.has(event, ["involvedObject", "uid"]) && this.errorEvents[event.involvedObject.uid]) {
					_.each(this.errorEvents[event.involvedObject.uid], (timeoutId) => {
						clearTimeout(timeoutId);
					});
				}
			}
		});
		this.events.start();
	}

	stop() {
		this.events.stop();
		_.each(this.errorEvents, (event) => {
			_.each(event, (timeoutId) => {
				clearTimeout(timeoutId);
			});
		});
		this.removeAllListeners();
	}
}

module.exports = HealthCheck;
