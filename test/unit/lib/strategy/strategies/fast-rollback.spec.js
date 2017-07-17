"use strict";

const sinon = require("sinon");
const sinonChai = require("sinon-chai");
const chai = require("chai");
chai.should();
chai.use(sinonChai);
const expect = chai.expect;
const Promise = require("bluebird");
const FastRollback = require("../../../../../src/lib/strategy/strategies/fast-rollback").Strategy;

function timestampAddDays(currentDate, days) {
	const tmpDate = new Date(currentDate);
	tmpDate.setDate(tmpDate.getDate() + days);
	return tmpDate.toISOString()
}

describe("FastRollback Strategy", () => {
	describe("New", () => {
		const tmpApplyingConfigurationPath = "tmp/path/manifest.json";
		var options, strategy, getResult, results;
		const noResults = {
			items: []
		};
		const validResults = {
			items: [1,2,3]
		};
		const kubectl = {
			get: function() {
				return Promise.resolve(getResult);
			},
			list: function() {
				return Promise.resolve(results);
			},
			apply: function() {
				return Promise.resolve();
			},
			deleteByName: function() {
				return Promise.resolve();
			}
		};
		const kubectlGetSpy = sinon.spy(kubectl, "get");
		const kubectlListSpy = sinon.spy(kubectl, "list");
		const kubectlApplySpy = sinon.spy(kubectl, "apply");
		const kubectlDeleteByNameSpy = sinon.spy(kubectl, "deleteByName");
		beforeEach(() => {
			results = [];
			kubectlGetSpy.reset();
			kubectlListSpy.reset();
			kubectlApplySpy.reset();
			kubectlDeleteByNameSpy.reset();
			options = {
				deployId: "dep1",
				kubectl: kubectl,
				isRollback: false
			};
			strategy = new FastRollback(options);
		});
		it("should construct", () => {
			expect(strategy).to.be.an.instanceof(FastRollback);
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
					name: "test-deployment-dep1"
				}
			};
			expect(strategy.annotate(givenManifest)).to.deep.equal(expectedManifest);
		});
		describe("calling skipDeploy,preDeploy with service", () => {
			var givenManifest;
			beforeEach(() => {
				givenManifest = {
					kind: "service",
					metadata: {
						name: "test-svc"
					},
					spec: {
						selector: {
							name: "test-svc",
							id: "dep-1"
						}
					}
				};
			});
			describe("and manifest found in cluster", () => {
				var skip;
				var found = true;
				var differences = false;
				beforeEach(() => {
					skip = strategy.skipDeploy(givenManifest, found, differences)
					return strategy.preDeploy(givenManifest, found, differences, tmpApplyingConfigurationPath)
				});
				it("should return false", () => {
					expect(skip).to.be.false;
				});
				describe("and allAvailable is called", () => {
					const givenManifests = [];
					var err;
					var allAvailableFunc;
					beforeEach(() => {
						err = undefined;
						allAvailableFunc = function(strategy, res) {
							results = res;
							return new Promise((resolve, reject) => {
								strategy.allAvailable(givenManifests).then((resp) => {
									resolve();
								}).catch((msg) => {
									err = msg;
									resolve();
								});
							});
						}
					});
					describe("and NO pods match selector in cluster", () => {
						beforeEach(() => {
							return allAvailableFunc(strategy, noResults);
						});
						it("should call list", () => {
							expect(kubectlListSpy).to.have.been.called.once;
							expect(kubectlListSpy).to.have.been.calledWith("pods", "name=test-svc,id=dep-1");
						});
						it("should return error", () => {
							expect(err).to.be.an("error");
						});
						it("should NOT call apply", () => {
							expect(kubectlApplySpy).not.to.have.been.called;
						});
					});
					describe("and pods match selector in cluster", () => {
						beforeEach(() => {
							return allAvailableFunc(strategy, validResults);
						});
						it("should call list", () => {
							expect(kubectlListSpy).to.have.been.called.once;
							expect(kubectlListSpy).to.have.been.calledWith("pods", "name=test-svc,id=dep-1");
						});
						it("should NOT return error", () => {
							expect(err).to.be.undefined;
						});
						it("should call apply", () => {
							expect(kubectlApplySpy).to.have.been.called.once;
							expect(kubectlApplySpy).to.have.been.calledWith(tmpApplyingConfigurationPath);
						});
					});
				});
			});
			describe("and manifest NOT found in cluster", () => {
				it("should return true", () => {
					expect(strategy.skipDeploy(givenManifest, false, tmpApplyingConfigurationPath)).to.be.false;
				});
			});
		});
		describe("calling skipDeploy with deployment", () => {
			var givenManifest;
			beforeEach(() => {
				givenManifest = {
					kind: "Deployment",
					metadata: {
						name: "test-deployment"
					}
				};
			});
			describe("and manifest NOT found in cluster", () => {
				it("should return false", () => {
					expect(strategy.skipDeploy(givenManifest, false, tmpApplyingConfigurationPath)).to.be.false;
				});
			});
			describe("and manifest found in cluster", () => {
				it("should return false", () => {
					expect(strategy.skipDeploy(givenManifest, true, tmpApplyingConfigurationPath)).to.be.true;
				});
			});
		});
		describe("calling deleteBackups", () => {
			describe("and no deployments", () => {
				it("should return empty array", () => {
					strategy.deployments = [];
					return strategy.deleteBackups().then((res) => {
						expect(res).to.be.empty;
					});
				});
			});
			describe("and there are deployments", () => {
				it("should delete correct deployments", () => {
					const currentDate = new Date();
					getResult = {
						kind: "Deployment",
						metadata: {
							name: "test-deployment-dep-1",
							annotations: {
								"kit-deployer/original-name": "test-deployment"
							},
							labels: {
								service: "test-svc",
								id: "dep-1"
							},
							creationTimestamp: timestampAddDays(currentDate, 0)
						}
					};
					results = {
						items: [
							{
								kind: "Deployment",
								metadata: {
									name: "test-deployment-dep-1",
									annotations: {
										"kit-deployer/original-name": "test-deployment"
									},
									creationTimestamp: timestampAddDays(currentDate, 0)
								}
							},
							{
								kind: "Deployment",
								metadata: {
									name: "test-deployment-dep-2",
									annotations: {
										"kit-deployer/original-name": "test-deployment"
									},
									creationTimestamp: timestampAddDays(currentDate, -1)
								}
							},
							{
								kind: "Deployment",
								metadata: {
									name: "test-deployment-dep-3",
									annotations: {
										"kit-deployer/original-name": "test-deployment"
									},
									creationTimestamp: timestampAddDays(currentDate, -2)
								}
							},
							{
								kind: "Deployment",
								metadata: {
									name: "test-deployment-dep-4",
									annotations: {
										"kit-deployer/original-name": "test-deployment"
									},
									creationTimestamp: timestampAddDays(currentDate, -3)
								}
							},
							{
								kind: "Deployment",
								metadata: {
									name: "test-deployment-dep-5",
									annotations: {
										"kit-deployer/original-name": "test-deployment"
									},
									creationTimestamp: timestampAddDays(currentDate, -4)
								}
							},
							{
								kind: "Deployment",
								metadata: {
									name: "test-deployment-dep-6",
									annotations: {
										"kit-deployer/original-name": "test-deployment"
									},
									creationTimestamp: timestampAddDays(currentDate, -5)
								}
							},
							{
								kind: "Deployment",
								metadata: {
									name: "test-deployment-dep-7",
									annotations: {
										"kit-deployer/original-name": "test-deployment-NOT-THE-SAME"
									},
									creationTimestamp: timestampAddDays(currentDate, -6)
								}
							}
						]
					};
					strategy.deployments = [{
						manifest: {
							kind: "Deployment",
							metadata: {
								name: "test-deployment-dep-1",
								annotations: {
									"kit-deployer/original-name": "test-deployment"
								}
							},
							labels: {
								service: "test-svc",
								id: "dep-1"
							}
						}
					}];
					return strategy.deleteBackups().then((res) => {
						expect(kubectlGetSpy).to.have.been.calledOnce;
						expect(kubectlGetSpy).to.have.been.calledWith("deployment", "test-deployment-dep-1");
						expect(kubectlListSpy).to.have.been.calledOnce;
						expect(kubectlListSpy).to.have.been.calledWith("deployments", "service=test-svc,id!=dep-1");
						expect(res).to.contain(results.items[4]);
						expect(res).to.contain(results.items[5]);
						expect(res).to.have.length(2);
						expect(kubectlDeleteByNameSpy).to.have.been.calledTwice;
						expect(kubectlDeleteByNameSpy).to.have.been.calledWith("deployment", "test-deployment-dep-5");
						expect(kubectlDeleteByNameSpy).to.have.been.calledWith("deployment", "test-deployment-dep-6");
					});
				});
			});
		});
		describe("calling deleteNewer", () => {
			describe("and no deployments", () => {
				it("should return empty array", () => {
					strategy.deployments = [];
					return strategy.deleteNewer().then((res) => {
						expect(res).to.be.empty;
					});
				});
			});
			describe("and there are deployments", () => {
				it("should delete correct deployments", () => {
					const currentDate = new Date();
					getResult = {
						kind: "Deployment",
						metadata: {
							name: "test-deployment-dep-1",
							annotations: {
								"kit-deployer/original-name": "test-deployment"
							},
							labels: {
								service: "test-svc",
								id: "dep-1"
							},
							creationTimestamp: timestampAddDays(currentDate, 0)
						}
					};
					results = {
						items: [
							{
								kind: "Deployment",
								metadata: {
									name: "test-deployment-dep-1",
									annotations: {
										"kit-deployer/original-name": "test-deployment"
									},
									creationTimestamp: timestampAddDays(currentDate, 0)
								}
							},
							{
								kind: "Deployment",
								metadata: {
									name: "test-deployment-dep-2",
									annotations: {
										"kit-deployer/original-name": "test-deployment"
									},
									creationTimestamp: timestampAddDays(currentDate, 1)
								}
							},
							{
								kind: "Deployment",
								metadata: {
									name: "test-deployment-dep-3",
									annotations: {
										"kit-deployer/original-name": "test-deployment"
									},
									creationTimestamp: timestampAddDays(currentDate, 2)
								}
							},
							{
								kind: "Deployment",
								metadata: {
									name: "test-deployment-dep-4",
									annotations: {
										"kit-deployer/original-name": "test-deployment"
									},
									creationTimestamp: timestampAddDays(currentDate, -1)
								}
							},
							{
								kind: "Deployment",
								metadata: {
									name: "test-deployment-dep-5",
									annotations: {
										"kit-deployer/original-name": "test-deployment"
									},
									creationTimestamp: timestampAddDays(currentDate, -2)
								}
							},
							{
								kind: "Deployment",
								metadata: {
									name: "test-deployment-dep-6",
									annotations: {
										"kit-deployer/original-name": "test-deployment"
									},
									creationTimestamp: timestampAddDays(currentDate, -3)
								}
							},
							{
								kind: "Deployment",
								metadata: {
									name: "test-deployment-dep-7",
									annotations: {
										"kit-deployer/original-name": "test-deployment-NOT-THE-SAME"
									},
									creationTimestamp: timestampAddDays(currentDate, -4)
								}
							}
						]
					};
					strategy.deployments = [{
						manifest: {
							kind: "Deployment",
							metadata: {
								name: "test-deployment-dep-1",
								annotations: {
									"kit-deployer/original-name": "test-deployment"
								}
							},
							labels: {
								service: "test-svc",
								id: "dep-1"
							}
						}
					}];
					return strategy.deleteNewer().then((res) => {
						expect(kubectlGetSpy).to.have.been.calledOnce;
						expect(kubectlGetSpy).to.have.been.calledWith("deployment", "test-deployment-dep-1");
						expect(kubectlListSpy).to.have.been.calledOnce;
						expect(kubectlListSpy).to.have.been.calledWith("deployments", "service=test-svc,id!=dep-1");
						expect(res).to.contain(results.items[1]);
						expect(res).to.contain(results.items[2]);
						expect(res).to.have.length(2);
						expect(kubectlDeleteByNameSpy).to.have.been.calledTwice;
						expect(kubectlDeleteByNameSpy).to.have.been.calledWith("deployment", "test-deployment-dep-2");
						expect(kubectlDeleteByNameSpy).to.have.been.calledWith("deployment", "test-deployment-dep-3");
					});
				});
			});
		});
	});
});
