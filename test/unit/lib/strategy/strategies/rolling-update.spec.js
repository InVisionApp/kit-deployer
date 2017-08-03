"use strict";

const chai = require("chai");
const expect = chai.expect;
const RollingUpdate = require("../../../../../src/lib/strategy/strategies/rolling-update").Strategy;

describe("RollingUpdate Strategy", () => {
	describe("New", () => {
		var options, strategy;
		beforeEach(() => {
			options = {
				deployId: "dep1"
			};
			strategy = new RollingUpdate(options);
		});
		it("should construct", () => {
			expect(strategy).to.be.an.instanceof(RollingUpdate);
		});
		it("should annotate", () => {
			const givenManifest = {
				kind: "Deployment",
				metadata: {
					name: "test-deployment"
				}
			};
			const expectedManifest = {
				kind: "Deployment",
				metadata: {
					name: "test-deployment"
				}
			};
			expect(strategy.annotate(givenManifest)).to.deep.equal(expectedManifest);
		});
		it("should skipDeploy when no differences", () => {
			const givenManifest = {
				kind: "Deployment",
				metadata: {
					name: "test-deployment"
				}
			};
			const found = false;
			const differences = false;
			expect(strategy.skipDeploy(givenManifest, found, differences)).to.be.true;
		});
		it("should not skipDeploy when differences", () => {
			const givenManifest = {
				kind: "Deployment",
				metadata: {
					name: "test-deployment"
				}
			};
			const found = false;
			const differences = true;
			expect(strategy.skipDeploy(givenManifest, found, differences)).to.be.false;
		});
		it("should allAvailable", () => {
			const givenManifests = [{
				kind: "Deployment",
				metadata: {
					name: "test-deployment"
				}
			}];
			return strategy.allAvailable(givenManifests).then((resp) => {
				expect(resp).to.be.empty;
			});
		});
	});
});
