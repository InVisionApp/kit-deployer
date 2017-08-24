"use strict";

const expect = require("chai").expect;
const EventError = require("../../../src/util/event-error");

describe("EventError", () => {
  var err, testEvent;

  describe("and valid event error", () => {
    beforeEach(function() {
      testEvent = {
        involvedObject: {
          name: "object-name-here"
        },
        message: "Event message here"
      };
      err = new EventError(testEvent);
    });

    it("should have the correct name", () => {
      expect(err.name).to.equal("EventError");
    });

    it("should be an instance of the EventError type", () => {
      expect(err).to.be.instanceof(EventError);
    });

    it("should be an instance of the Error type", () => {
      expect(err).to.be.instanceof(Error);
    });

    it("should return the event message", () => {
      expect(err.message).to.equal(
        testEvent.message + " for " + testEvent.involvedObject.name
      );
    });
  });

  describe("and event error missing object", () => {
    beforeEach(function() {
      testEvent = {
        message: "Event message here"
      };
      err = new EventError(testEvent);
    });

    it("should return the event message", () => {
      expect(err.message).to.equal(testEvent.message);
    });
  });

  describe("and event error missing message and object", () => {
    beforeEach(function() {
      testEvent = {};
      err = new EventError(testEvent);
    });

    it("should return the event message", () => {
      expect(err.message).to.equal("Unknown kubernetes event error");
    });
  });
});
