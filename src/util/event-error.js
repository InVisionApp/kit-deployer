"use strict";

/*
 * Allows to explicitly detect an event error by extending the base Error class.
 */
class EventError extends Error {
	constructor(event) {
		let message = event.message || "Unknown kubernetes event error";
		if (event.involvedObject && event.involvedObject.name) {
			message = message + " for " + event.involvedObject.name;
		}
		super(message);
		this.message = message;
		this.name = "EventError";
		this.event = event;
	}
}

module.exports = EventError;
