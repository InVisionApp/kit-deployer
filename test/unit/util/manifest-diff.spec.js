"use strict";

const _ = require("lodash");
const expect = require("chai").expect;
const manifestDiff = require("../../../src/util/manifest-diff");

const scenarios = {
	"both empty objects": {
		previous: {},
		latest: {},
		expected: undefined
	},
	"previous with empty object and latest with new property": {
		previous: {},
		latest: {
			enabled: true
		},
		expected: [
			{
				kind: "N",
				path: [
					"enabled"
				],
				rhs: true
			}
		]
	},
	"previous object has same properties as latest": {
		previous: {
			enabled: true
		},
		latest: {
			enabled: true
		},
		expected: undefined
	},
	"previous object has same properties as latest, but value is different": {
		previous: {
			enabled: true
		},
		latest: {
			enabled: false
		},
		expected: [
			{
				kind: "E",
				path: [
					"enabled"
				],
				lhs: true,
				rhs: false
			}
		]
	},
	"previous object has properties and latest has same but new property": {
		previous: {
			enabled: true
		},
		latest: {
			enabled: true,
			brand: "new"
		},
		expected: [
			{
				kind: "N",
				path: [
					"brand"
				],
				rhs: "new"
			}
		]
	},
	"previous object array of properties and latest has same but in different order": {
		previous: {
			enabled: true,
			env: [
				{
					value: "001"
				},
				{
					value: "002"
				}
			]
		},
		latest: {
			enabled: true,
			env: [
				{
					value: "002"
				},
				{
					value: "001"
				}
			]
		},
		expected: [
			{
				kind: "E",
				path: [
					"env",
					0,
					"value"
				],
				lhs: "001",
				rhs: "002"
			},
			{
				kind: "E",
				path: [
					"env",
					1,
					"value"
				],
				lhs: "002",
				rhs: "001"
			}
		]
	},
	"previous object has name properties and latest has same but in different order": {
		previous: {
			enabled: true,
			env: [
				{
					name: "first",
					value: "001"
				},
				{
					name: "second",
					value: "002"
				}
			]
		},
		latest: {
			enabled: true,
			env: [
				{
					name: "second",
					value: "002"
				},
				{
					name: "first",
					value: "001"
				}
			]
		},
		expected: undefined
	},
	"previous object has name properties and latest has same but in different order and with one different value": {
		previous: {
			enabled: true,
			env: [
				{
					name: "first",
					value: "001"
				},
				{
					name: "second",
					value: "002"
				}
			]
		},
		latest: {
			enabled: true,
			env: [
				{
					name: "second",
					value: "002"
				},
				{
					name: "first",
					value: "0001"
				}
			]
		},
		expected: [
			{
				kind: "E",
				path: [
					"env",
					"first",
					"value"
				],
				lhs: "001",
				rhs: "0001"
			}
		]
	},
	"previous object has name properties and latest has properties and a new one and in different order and one value change": {
		previous: {
			enabled: true,
			env: [
				{
					name: "first",
					value: "001"
				},
				{
					name: "second",
					value: "002"
				}
			]
		},
		latest: {
			enabled: true,
			env: [
				{
					name: "third",
					value: "003"
				},
				{
					name: "second",
					value: "002"
				},
				{
					name: "first",
					value: "0001"
				}
			]
		},
		expected: [
			{
				kind: "E",
				path: [
					"env",
					"first",
					"value"
				],
				lhs: "001",
				rhs: "0001"
			},
			{
				kind: "N",
				path: [
					"env",
					"third"
				],
				rhs: {
					name: "third",
					value: "003"
				}
			}
		]
	}
};

describe("manifestDiff", () => {
	_.each(scenarios, (scenario, desc) => {
		describe(desc, () => {
			it("should be expected result", () => {
				const result = manifestDiff(scenario.previous, scenario.latest);
				expect(result).to.deep.equal(scenario.expected);
			});
		});
	});
});
