"use strict";

const expect = require("chai").expect;
const TimeoutError = require("../../../src/util/timeout-error");

describe("TimeoutError", () => {
	var error, message;

	beforeEach(function() {
		message = "The deployment timed out.";
		error = new TimeoutError(message);
	});

	it("should have the correct name", () => {
		expect(error.name).to.equal("TimeoutError");
	});

	it("should be an instance of the TimeoutError type", () => {
		expect(error).to.be.instanceof(TimeoutError);
	});

	it("should be an instance of the Error type", () => {
		expect(error).to.be.instanceof(Error);
	});

	it("should return the original message", () => {
		expect(error.message).to.equal(message);
	});
});
