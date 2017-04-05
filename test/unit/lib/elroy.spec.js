"use strict"

const chai = require("chai");
const Promise = require("bluebird");
const expect = chai.expect;
const Elroy = require("../../../src/lib/elroy");

describe("Elroy", () => {

	const testManifest = {metadata: {name: "testManifesst"} };
	let success, calledWith;
	const requestMock = function(opt) {
		calledWith = opt;
		return new Promise((resolve, reject) => {
			if (success == true) {
				resolve();
			} else {
				reject(new Error("Example error"));
			}
		});
	};

	describe("Enabled and success", () => {
		before( () => {
		});
		after( () => {
			success = false;
			calledWith = undefined;
		});
		it("should call request correctly", () => {
			success = true;
			const elroy = new Elroy({
				url: "https://elroy.example.com",
				secret: "xxxxxx",
				enabled: true
			});
			elroy.request = requestMock;
			return elroy
				.save("sampleCluster", testManifest)
				.then(() => {
					expect(calledWith.uri).to.equal("https://elroy.example.com/api/v1/deployment-environment");
				});
		});
	});
	describe("Not Enabled", () => {
		it("should not save and resolve empty promise", () => {
			success = true;
			const elroy = new Elroy({
				url: "https://elroy.example.com",
				secret: "xxxxxx",
				enabled: true
			});
			elroy.request = requestMock;
			return elroy
				.save("testCluster", testManifest)
				.then((data) => {
					expect(data).to.not.exist;
				});
		});
	});
	describe("Enabled and error", () => {
		it("should resolve with error", (done) => {
			success = false;
			const elroy = new Elroy({
				url: "https://elroy.example.com",
				secret: "xxxxxx",
				enabled: true
			});
			elroy.request = requestMock;
			elroy
				.save("testCluster", testManifest)
				.then(() => {
					done("Should not be successful when expecting error");
				})
				.catch((err) => {
					done();
				});
		});
	});
});
