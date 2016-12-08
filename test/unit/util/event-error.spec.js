"use strict";

const expect = require("chai").expect;
const EventError = require("../../../src/util/event-error");

describe("EventError", () => {
	var error, event;

	beforeEach(function() {
		event = {
			message: "Event message here"
		};
		error = new EventError(event);
	});

	it("should have the correct name", () => {
		expect(error.name).to.equal("EventError");
	});

	it("should be an instance of the EventError type", () => {
		expect(error).to.be.instanceof(EventError);
	});

	it("should be an instance of the Error type", () => {
		expect(error).to.be.instanceof(Error);
	});

	it("should return the event message", () => {
		expect(error.message).to.equal(event.message);
	});
});
