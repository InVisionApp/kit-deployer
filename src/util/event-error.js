"use strict";

/*
 * Allows to explicitly detect an event error by extending the base Error class.
 */
class EventError extends Error {
	constructor(event) {
		const message = event.message || "Unknown kubernetes event error";
		super(message);
		this.message = message;
		this.name = "EventError";
		this.event = event;
	}
}

module.exports = EventError;
