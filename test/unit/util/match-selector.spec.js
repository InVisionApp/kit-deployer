"use strict";

const _ = require("lodash");
const expect = require("chai").expect;
const matchSelector = require("../../../src/util/match-selector");

const scenarios = {
	"empty selector": {
		labels: {
			test: "yes"
		},
		selector: "",
		expected: true
	},
	"undefined selector": {
		labels: {
			test: "yes"
		},
		selector: undefined,
		expected: true
	},
	"empty labels and empty selector": {
		labels: {},
		selector: "",
		expected: true
	},
	"undefined labels and undefined selector": {
		labels: undefined,
		selector: undefined,
		expected: true
	},
	"equality fulfilled": {
		labels: {
			test: "yes"
		},
		selector: "test = yes",
		expected: true
	},
	"inequality fulfilled": {
		labels: {
			test: "yes"
		},
		selector: "test != no",
		expected: true
	},
	"equality unfulfilled": {
		labels: {
			test: "yes"
		},
		selector: "test = no",
		expected: false
	},
	"inequality unfulfilled": {
		labels: {
			test: "yes"
		},
		selector: "test != yes",
		expected: false
	},
	"multiple equality fulfilled": {
		labels: {
			test: "yes",
			enabled: "no"
		},
		selector: "test = yes, enabled = no",
		expected: true
	},
	"multiple setin fulfilled": {
		labels: {
			test: "yes",
			enabled: "no"
		},
		selector: "test in (yes, no), enabled in (no)",
		expected: true
	},
	"multiple setin unfulfilled": {
		labels: {
			test: "yes",
			enabled: "no"
		},
		selector: "test in (yes, no), enabled in (yes)",
		expected: false
	},
	"multiple setnotin fulfilled": {
		labels: {
			test: "yes",
			enabled: "no"
		},
		selector: "test notin (no, maybe), enabled notin (yes, maybe)",
		expected: true
	},
	"multiple setnotin unfulfilled": {
		labels: {
			test: "yes",
			enabled: "no"
		},
		selector: "test notin (yes, maybe), enabled notin (no, maybe)",
		expected: false
	},
	"matching set fulfilled": {
		labels: {
			test: "yes",
			enabled: "no"
		},
		selector: "test",
		expected: true
	},
	"multiple set fulfilled": {
		labels: {
			test: "yes",
			enabled: "no"
		},
		selector: "test, enabled",
		expected: true
	},
	"multiple set unfulfilled": {
		labels: {
			test: "yes",
			enabled: "no"
		},
		selector: "test, missing",
		expected: false
	},
	"multiple setnot fulfilled": {
		labels: {
			test: "yes",
			enabled: "no"
		},
		selector: "!missing, !disabled",
		expected: true
	},
	"multiple setnot unfulfilled": {
		labels: {
			test: "yes",
			enabled: "no"
		},
		selector: "!test, !disabled",
		expected: false
	},
	"mix fulfilled": {
		labels: {
			test: "yes",
			enabled: "no"
		},
		selector: "test in (yes, no), !disabled, enabled, enabled = no",
		expected: true
	},
	"undefined lables with mix selector fulfilled": {
		labels: undefined,
		selector: "!disabled, enabled != no",
		expected: true
	},
	"empty lables with mix selector fulfilled": {
		labels: {},
		selector: "!disabled, enabled != no",
		expected: true
	},
	"undefined lables with mix selector unfulfilled": {
		labels: {},
		selector: "test in (yes, no), !disabled, enabled",
		expected: false
	},
	"empty lables with mix selector unfulfilled": {
		labels: {},
		selector: "test in (yes, no), !disabled, enabled",
		expected: false
	},
	"mix unfulfilled": {
		labels: {
			test: "yes",
			enabled: "no"
		},
		selector: "test in (yes, no), !disabled, enabled, enabled = yes",
		expected: false
	}
};

describe("Selector", () => {
	_.each(scenarios, (scenario, desc) => {
		describe(desc, () => {
			it("should be expected result", () => {
				expect(matchSelector(scenario.labels, scenario.selector)).to.equal(scenario.expected);
			});
		});
	});
});
