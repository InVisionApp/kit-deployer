"use strict";

const _ = require("lodash");
const chai = require("chai");
const expect = chai.expect;
const Annotator = require("../../../src/lib/annotator").Annotator;
const Annotations = require("../../../src/lib/annotator").Annotations;

describe("Annotator", () => {
	describe("Create New", () => {
		let annotator;
		const originalManifest = {
			kind: "Deployment",
			metadata: {
				name: "manifest-deployment"
			}
		};
		const originalJobManifest = {
			kind: "Job",
			metadata: {
				name: "manifest-job"
			}
		};
		const options = {
			sha: "123abc"
		};
		beforeEach(() => {
			annotator = new Annotator(options);
		});
		it("should be cool with it", () => {
			expect(annotator.options.sha).to.equal(options.sha);
		});
		describe("and calling annotate on deployment", () => {
			it("should set the expected annotations", () => {
				const manifest = annotator.annotate(_.cloneDeep(originalManifest));
				expect(manifest.metadata.name).to.equal(originalManifest.metadata.name);
				expect(manifest.metadata.annotations[Annotations.OriginalName]).to.equal(originalManifest.metadata.name);
				expect(manifest.metadata.annotations[Annotations.LastAppliedConfiguration]).to.equal(JSON.stringify(originalManifest));
				expect(manifest.metadata.annotations[Annotations.LastAppliedConfigurationHash]).to.equal("824c6735b631f957a285da2873d1465d797e4e6f");
				expect(manifest.metadata.annotations[Annotations.Commit]).to.equal(JSON.stringify(options.sha));
			});
		});
		describe("and calling annotate on job", () => {
			it("should set the expected annotations", () => {
				const manifest = annotator.annotate(_.cloneDeep(originalJobManifest));
				expect(manifest.metadata.name).to.equal(originalJobManifest.metadata.name + "-f94274f6bdc905825d1616fe265bc6d2de773e7c");
				expect(manifest.metadata.annotations[Annotations.OriginalName]).to.equal(originalJobManifest.metadata.name);
				expect(manifest.metadata.annotations[Annotations.LastAppliedConfiguration]).to.equal(JSON.stringify(originalJobManifest));
				expect(manifest.metadata.annotations[Annotations.LastAppliedConfigurationHash]).to.equal("f94274f6bdc905825d1616fe265bc6d2de773e7c");
				expect(manifest.metadata.annotations[Annotations.Commit]).to.equal(JSON.stringify(options.sha));
			});
		});
	});
});
