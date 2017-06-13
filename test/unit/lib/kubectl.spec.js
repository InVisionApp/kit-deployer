"use strict"

const chai = require("chai");
const expect = chai.expect;
const Kubectl = require("../../../src/lib/kubectl");

describe("Kubectl", () => {
	describe("Constructor", () => {
		it("should construct without error", () => {
			const kubectl = new Kubectl({});
			expect(kubectl).to.exist;
		});
	});
	describe("Spawn", () => {
		it("should emit spawn event", (done) => {
			const kubectl = new Kubectl({});
			kubectl.on("spawn", (args) => {
				expect(args[0]).to.equal("help");
				done();
			});
			kubectl.spawn(["help"]);
		});
		it("should run without error", (done) => {
			const kubectl = new Kubectl({});
			kubectl.spawn(["help"], done);
		});
	});
});
