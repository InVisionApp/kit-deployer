"use strict"

const sinon = require("sinon");
const chai = require("chai");
const AWS = require("aws-sdk");
const expect = chai.expect;
const Backup = require("../../../src/lib/backup");

describe("Backup", () => {

	const testManifest = {metadata: {name: "testManifesst"} };

	describe("Enabled valid", () => {
		before( () => {
			process.env.AWS_ACCESS_KEY_ID = "xxxx";
			process.env.AWS_SECRET_ACCESS_KEY = "xxxxxx";
		});
		after( () => {
			delete process.env.AWS_ACCESS_KEY_ID;
			delete process.env.AWS_SECRET_ACCESS_KEY;
		});
		it("should call s3 correctly", (done) => {
			const backup = new Backup(true, "testBucket", "yaml");
			backup.s3 = new AWS.S3();
			backup.s3.putObject = sinon.stub();
			backup.s3.putObject.yields(undefined, {} ); //{success: true});
			backup.save("sampleCluster", testManifest).then(() => {
				expect(backup.s3.putObject.callCount).to.equal(1);
				done();
			}).catch( (err) => {
				done(err);
			});
		});
	});
	describe("Enabled invalid", () => {
		it("should throw an error without bucket value", (done) => {
			try {
				const backup = new Backup(true, "");
			} catch (err) {
				expect(err).to.exist;
				done();
			}
		});
		it("should throw an error without ENV values", (done) => {
			try {
				const backup = new Backup(true, "testBucket", "yaml");
			} catch (err) {
				expect(err).to.exist;
				done();
			}
		});
	});
	describe("Not Enabled", () => {
		it("should not load AWS S3 and resolve empty promise", (done) => {
			const backup = new Backup(false, testManifest, "yaml");
			backup.save("testCluster", testManifest).then( (data) => {
				expect(data).to.not.exist;
				done();
			}).catch( (err) => {
				done(err);
			});
		});
	});
});
