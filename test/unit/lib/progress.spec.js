"use strict"

const chai = require("chai");
const expect = chai.expect;
const Progress = require("../../../src/lib/progress");

describe("Progress", () => {
	describe("Constructor", () => {
		it("should construct without error", () => {
			const progress = new Progress();
			expect(progress).to.exist;
		});
	});
	describe("Add", () => {
		it("should error when non-string", () => {
			const progress = new Progress();
			var fn = function() {
				progress.add({});
			};
			expect(fn).to.throw(Error);
		});
		it("should add cluster", () => {
			const progress = new Progress();
			progress.add("test-cluster1");
			progress.add("test-cluster2");
			progress.add("test-cluster3");
			progress.add("test-cluster4");
			expect(progress.status().clusters.total).to.equal(4);
			expect(progress.status().clusters.found).to.have.length(4);
			expect(progress.status().clusters.remaining).to.have.length(4);
			expect(progress.status().clusters.completed).to.equal(0);
			expect(progress.status().clusters.successful).to.have.length(0);
			expect(progress.status().clusters.failed).to.have.length(0);
			expect(progress.status().percent).to.equal(0);
		});

		describe("Success", () => {
			let progress;
			beforeEach(() => {
				progress = new Progress();
				progress.add("test-cluster1");
				progress.add("test-cluster2");
				progress.add("test-cluster3");
				progress.add("test-cluster4");
			});
			it("should error when non-string", () => {
				var fn = function() {
					progress.success({});
				};
				expect(fn).to.throw(Error);
			});
			it("should increment status", () => {
				progress.success("test-cluster1");
				expect(progress.status().clusters.total).to.equal(4);
				expect(progress.status().clusters.found).to.have.length(4);
				expect(progress.status().clusters.remaining).to.have.length(3);
				expect(progress.status().clusters.completed).to.equal(1);
				expect(progress.status().clusters.successful).to.have.length(1);
				expect(progress.status().clusters.failed).to.have.length(0);
				expect(progress.status().percent).to.equal(0.25);
			});
			it("should emit progress", (done) => {
				progress.on("progress", function() {
					done();
				});
				progress.success("test-cluster1");
			});
		});

		describe("Fail", () => {
			let progress;
			beforeEach(() => {
				progress = new Progress();
				progress.add("test-cluster1");
				progress.add("test-cluster2");
				progress.add("test-cluster3");
				progress.add("test-cluster4");
			});
			it("should error when non-string", () => {
				var fn = function() {
					progress.fail({});
				};
				expect(fn).to.throw(Error);
			});
			it("should increment status", () => {
				progress.fail("test-cluster1");
				expect(progress.status().clusters.total).to.equal(4);
				expect(progress.status().clusters.found).to.have.length(4);
				expect(progress.status().clusters.remaining).to.have.length(3);
				expect(progress.status().clusters.completed).to.equal(1);
				expect(progress.status().clusters.successful).to.have.length(0);
				expect(progress.status().clusters.failed).to.have.length(1);
				expect(progress.status().percent).to.equal(0.25);
			});
			it("should emit progress", (done) => {
				progress.on("progress", function() {
					done();
				});
				progress.fail("test-cluster1");
			});
		});
	});
});
