"use strict";

const expect = require("chai").expect;
const PauseError = require("../../../src/util/pause-error");

describe("PauseError", () => {
  var error, name;

  beforeEach(function() {
    name = "Deployment:my-deployment";
    error = new PauseError(name);
  });

  it("should have the correct name", () => {
    expect(error.name).to.equal("PauseError");
  });

  it("should be an instance of the PauseError type", () => {
    expect(error).to.be.instanceof(PauseError);
  });

  it("should be an instance of the Error type", () => {
    expect(error).to.be.instanceof(Error);
  });

  it("should return the message with name", () => {
    expect(error.message).to.equal("Resource " + name + " is paused");
  });
});
