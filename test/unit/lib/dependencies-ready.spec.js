var sinon = require("sinon");
var sinonChai = require("sinon-chai");
var chai = require("chai");
chai.should();
chai.use(sinonChai);
var expect = chai.expect;
var _ = require("lodash");
var Promise = require("bluebird");

describe("Dependencies.ready", function() {
	var clock, kubectlListResolve, kubectlListReject, kubectlListSpy, dependencies, onInfo, onDebug;
	before(function() {
		clock = sinon.useFakeTimers();
	});
	beforeEach(function() {
		kubectlListResolve = null;
		kubectlListReject = null;
		var kubectl = {
			list: function() {
				return new Promise(function(resolve, reject) {
					kubectlListResolve = resolve;
					kubectlListReject = reject;
				});
			}
		};
		kubectlListSpy = sinon.spy(kubectl, "list");
		var Dependencies = require("../../../src/lib/dependencies");
		dependencies = new Dependencies({
			kubectl: kubectl
		});
		onDebug = sinon.spy();
		onInfo = sinon.spy();
		dependencies.on("debug", onDebug);
		dependencies.on("info", onInfo);
	});

	describe("when called", function() {
		beforeEach(function() {
			kubectlListSpy.reset();
		});
		var result, success, error;

		var hasDependenciesAssertions = function(context) {
			var manifestDependencies;
			beforeEach(function() {
				manifestDependencies = dependencies.find(context.manifest);
			});
			it("should log detected dependencies", function() {
				expect(onDebug).to.have.been.calledWith("Dependency detected for " + context.manifest.metadata.name + " <= " + manifestDependencies);
			});
			it("should call kubectl with desired 'selector'", function() {
				expect(kubectlListSpy).to.have.been.callCount(1);
				expect(kubectlListSpy).to.have.been.calledWith("deployment,service,secret,job", manifestDependencies);
			});

			describe("and kubectl request error", function() {
				beforeEach(function() {
					kubectlListReject();
				});
				it("should not try again until wait time has passed", function() {
					expect(kubectlListSpy).to.have.been.callCount(1);
				});
				describe("and wait time has passed", function() {
					it("should try again", function() {
						kubectlListSpy.reset();
						clock.tick(dependencies.options.wait * 1000 + 10);
						expect(kubectlListSpy).to.have.been.callCount(1);
					});
					describe("and timeout time has passed", function() {
						it("should return timeout error", function() {
							clock.tick(dependencies.options.timeout * 1000 + 10);
							return result.finally(function() {
								expect(error).to.be.an("error");
							});
						});
					});
				});
			});
		};

		var availableDependenciesAssertions = function(context) {
			var manifestDependencies;
			beforeEach(function() {
				manifestDependencies = dependencies.find(context.manifest);
			});
			describe("and all kubectl request are successful", function() {
				beforeEach(function() {
					kubectlListResolve(context.kubectlListResponse);
					return result;
				});
				it("should respond with array of successes", function() {
					expect(success).to.deep.equal([context.kubectlListResponse]);
				});
				it("should log dependencies as available", function() {
					expect(onInfo).to.have.been.calledWith("Dependency available for " + context.manifest.metadata.name + " <= " + manifestDependencies);
				});
			});
		};

		var unavailableDependenciesAssertions = function(context) {
			describe("and all kubectl request are successful, but unavailable", function() {
				beforeEach(function() {
					kubectlListResolve(context.kubectlListResponse);
				});
				it("should return timeout error", function() {
					clock.tick(dependencies.options.timeout * 1000 + 10);
					return result.finally(function() {
						expect(error).to.be.an("error");
					});
				});
			});
		};

		var scenarios = {
			"manifest with no dependencies": {
				manifest: {
					kind: "Secret",
					metadata: {
						name: "my-secret"
					}
				},
				after: function() {
					var self = this;
					it("should resolve instantly", function() {
						return dependencies
							.ready(self.manifest)
							.then(function(res) {
								expect(res).to.be.empty;
							});
					});
				}
			},
			"mainfest with single service dependency": {
				manifest: {
					kind: "Deployment",
					metadata: {
						name: "main-deployment",
						annotations: {
							"kit-deployer/dependency-selector": "my-svc"
						}
					}
				},
				kubectlListResponse: [
					{kind: "Service", status: "service1"}
				],
				after: function() {
					var self = this;
					hasDependenciesAssertions(self);
					availableDependenciesAssertions(self);
				}
			},
			"mainfest with multiple service dependencies": {
				manifest: {
					kind: "Deployment",
					metadata: {
						name: "main-deployment",
						annotations: {
							"kit-deployer/dependency-selector": "tier=service"
						}
					}
				},
				kubectlListResponse: [
					{kind: "Service", status: "service1"},
					{kind: "Service", status: "service2"},
					{kind: "Service", status: "service3"}
				],
				after: function() {
					var self = this;
					hasDependenciesAssertions(self);
					availableDependenciesAssertions(self);
				}
			},
			"mainfest with single secret dependency": {
				manifest: {
					kind: "Deployment",
					metadata: {
						name: "main-deployment",
						annotations: {
							"kit-deployer/dependency-selector": "my-secret"
						}
					}
				},
				kubectlListResponse: [
					{kind: "Service", status: "secret1"}
				],
				after: function() {
					var self = this;
					hasDependenciesAssertions(self);
					availableDependenciesAssertions(self);
				}
			},
			"mainfest with multiple secret dependencies": {
				manifest: {
					kind: "Deployment",
					metadata: {
						name: "main-deployment",
						annotations: {
							"kit-deployer/dependency-selector": "my-secret,second-secret,third-secret"
						}
					}
				},
				kubectlListResponse: [
					{kind: "Service", status: "secret1"},
					{kind: "Service", status: "secret2"},
					{kind: "Service", status: "secret3"}
				],
				after: function() {
					var self = this;
					hasDependenciesAssertions(self);
					availableDependenciesAssertions(self);
				}
			},
			"mainfest with single deployment dependency that is available": {
				manifest: {
					kind: "Deployment",
					metadata: {
						name: "main-deployment",
						annotations: {
							"kit-deployer/dependency-selector": "my-deployment"
						}
					}
				},
				kubectlListResponse: [
					{
						kind: "Deployment",
						status: {
							availableReplicas: 1,
							replicas: 1
						}
					}
				],
				after: function() {
					var self = this;
					hasDependenciesAssertions(self);
					availableDependenciesAssertions(self);
				}
			},
			"mainfest with multiple deployment dependencies that are available": {
				manifest: {
					kind: "Deployment",
					metadata: {
						name: "main-deployment",
						annotations: {
							"kit-deployer/dependency-selector": "my-deployment,second-deployment"
						}
					}
				},
				kubectlListResponse: [
					{
						kind: "Deployment",
						status: {
							availableReplicas: 1,
							replicas: 1
						}
					},
					{
						kind: "Deployment",
						status: {
							availableReplicas: 2,
							replicas: 2
						}
					}
				],
				after: function() {
					var self = this;
					hasDependenciesAssertions(self);
					availableDependenciesAssertions(self);
				}
			},
			"mainfest with multiple deployment dependencies that are unavailable": {
				manifest: {
					kind: "Deployment",
					metadata: {
						name: "main-deployment",
						annotations: {
							"kit-deployer/dependency-selector": "my-deployment,second-deployment"
						}
					}
				},
				kubectlListResponse: [
					{
						kind: "Deployment",
						status: {
							availableReplicas: 0,
							replicas: 1
						}
					},
					{
						kind: "Deployment",
						status: {
							availableReplicas: 1,
							replicas: 2
						}
					}
				],
				after: function() {
					var self = this;
					hasDependenciesAssertions(self);
					unavailableDependenciesAssertions(self);
				}
			},
			"mainfest with multiple job dependencies that are available": {
				manifest: {
					kind: "Deployment",
					metadata: {
						name: "main-deployment",
						annotations: {
							"kit-deployer/dependency-selector": "my-job,second-job"
						}
					}
				},
				kubectlListResponse: [
					{
						kind: "Job",
						status: {
							succeeded: 1
						}
					},
					{
						kind: "Job",
						status: {
							succeeded: 1
						}
					}
				],
				after: function() {
					var self = this;
					hasDependenciesAssertions(self);
					availableDependenciesAssertions(self);
				}
			},
			"mainfest with multiple job dependencies that are unavailable": {
				manifest: {
					kind: "Deployment",
					metadata: {
						name: "main-deployment",
						annotations: {
							"kit-deployer/dependency-selector": "my-job,second-job"
						}
					}
				},
				kubectlListResponse: [
					{
						kind: "Job",
						status: {
							succeeded: 0
						}
					},
					{
						kind: "Job",
						status: {
							succeeded: 0
						}
					}
				],
				after: function() {
					var self = this;
					hasDependenciesAssertions(self);
					unavailableDependenciesAssertions(self);
				}
			},
			"mainfest with multiple mixed dependencies that are available": {
				manifest: {
					kind: "Deployment",
					metadata: {
						name: "main-deployment",
						annotations: {
							"kit-deployer/dependency-selector": "my-job,my-deployment,my-service"
						}
					}
				},
				kubectlListResponse: [
					{
						kind: "Job",
						status: {
							succeeded: 1
						}
					},
					{
						kind: "Deployment",
						status: {
							availableReplicas: 2,
							replicas: 2
						}
					},
					{
						kind: "Service",
						status: "service1"
					}
				],
				after: function() {
					var self = this;
					hasDependenciesAssertions(self);
					availableDependenciesAssertions(self);
				}
			}
		};

		_.each(scenarios, function(scenario, description) {
			describe("and " + description, function() {
				beforeEach(function() {
					result = dependencies
						.ready(scenario.manifest, true)
						.then(function(res) {
							success = res;
						})
						.catch(function(err) {
							error = err;
						});
				});
				it("should return a promise", function() {
					expect(result).to.be.instanceof(Promise);
				});
				scenario.after();
			});
		});
	});

	after(function() {
		clock.restore();
	});
});
