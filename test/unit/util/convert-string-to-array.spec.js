"use strict";

const _ = require("lodash");
const expect = require("chai").expect;
const convertStringToArray = require("../../../src/util/convert-string-to-array");

const scenarios = {
  undefined: {
    string: undefined,
    expected: []
  },
  "empty string": {
    string: "",
    expected: []
  },
  "single string": {
    string: "testing",
    expected: ["testing"]
  },
  "single string array": {
    string: '["testing"]',
    expected: ["testing"]
  },
  "multi string array": {
    string: '["testing1", "testing2"]',
    expected: ["testing1", "testing2"]
  },
  "invalid json": {
    string: "[testing1, testing2]",
    expected: ["[testing1, testing2]"]
  }
};

describe("convertStringToArray", () => {
  _.each(scenarios, (scenario, desc) => {
    describe(desc, () => {
      it("should produce expected array", () => {
        expect(convertStringToArray(scenario.string)).to.deep.equal(
          scenario.expected
        );
      });
    });
  });
});
