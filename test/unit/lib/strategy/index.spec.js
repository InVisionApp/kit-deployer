"use strict";

const chai = require("chai");
const expect = chai.expect;
const Strategy = require("../../../../src/lib/strategy").Strategy;
const Strategies = require("../../../../src/lib/strategy").Strategies;

describe("Strategy", () => {
	describe("Strategies", () => {
		it("should have all available strategies", () => {
			expect(Strategies.FastRollback).to.equal("fast-rollback");
			expect(Strategies.RollingUpdate).to.equal("rolling-update");
		});
	});
	describe("New", () => {
		describe("Providing invalid strategy name", () => {
			it("should fail", () => {
				const fn = () => { new Strategy("invalid") };
				expect(fn).to.throw;
			});
		});
		describe("Providing rolling-update strategy", () => {
			it("should return name", () => {
				const strategy = new Strategy("rolling-update");
				expect(strategy.name).to.equal("rolling-update");
			});
		});
	});
});
