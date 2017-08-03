"use strict";

const exec = require("child_process").exec;
const expect = require("chai").expect;
const Kubectl = require("../../src/lib/kubectl");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const _ = require("lodash");

function clean(kubeconfigFile, namespace) {
	const cwd = path.dirname(kubeconfigFile);
	const kubectl = new Kubectl({
		cwd: cwd,
		kubeconfig: yaml.safeLoad(fs.readFileSync(kubeconfigFile, "utf8")),
		kubeconfigFile: kubeconfigFile
	});
	return kubectl.deleteByName("namespace", namespace);
}

describe("Functional", function() {
	this.timeout(180000);

	beforeEach(function() {
		process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
		process.env.SELECTOR = "app in (test)";
		process.env.DEBUG = "true";
		process.env.DRY_RUN = "false";
		process.env.DIFF = "true";
		process.env.GITHUB_ENABLED = "false";
		process.env.CI_COMMIT_ID = "6fc66dc2a0b75265ed14e45b754731d8c09b26d6";
		process.env.NAMESPACES_DIR = "/test/functional/clusters/namespaces";
		process.env.MANIFESTS_DIR = "/test/functional/clusters/manifests";
		process.env.AVAILABLE_ENABLED = "true";
		process.env.AVAILABLE_HEALTH_CHECK = "true";
		process.env.AVAILABLE_HEALTH_CHECK_GRACE_PERIOD = "3";
		process.env.AVAILABLE_HEALTH_CHECK_THRESHOLD = "1";
		process.env.AVAILABLE_ALL = "true";
		process.env.AVAILABLE_TIMEOUT = "60";
		process.env.AVAILABLE_REQUIRED = "true";
		process.env.AVAILABLE_KEEP_ALIVE = "true";
		process.env.AVAILABLE_WEBHOOK = "http://example.com/test";
		process.env.STRATEGY = "rolling-update";
	});

	describe("when deploying to example cluster", function() {
		const kubeconfigFile = "/test/functional/clusters/configs/example-kubeconfig.yaml";
		describe("and example cluster does not exist yet", function() {
			it("should deploy without error", function(done) {
				process.env.CONFIGS = kubeconfigFile;

				exec("./src/deployer", function(error, stdout, stderr) {
					expect(error).to.be.a("null", stdout);
					expect(stderr).to.be.empty;
					expect(stdout).not.to.be.empty;
					expect(stdout).to.contain("Generating tmp directory:");
					expect(stdout).to.contain("example-cluster - Strategy rolling-update");
					expect(stdout).to.contain("example-cluster - Getting list of namespaces");
					expect(stdout).to.contain("example-cluster - Create example namespace");
					expect(stdout).to.contain("example-cluster - namespace \"example\" created");
					expect(stdout).to.contain("Sending payload to http://example.com/test/auth-svc for auth-svc with status STARTED/IN_PROGRESS");
					expect(stdout).to.contain("example-cluster - Getting list of service matching 'app in (test)'");
					expect(stdout).to.contain("example-cluster - Found 0 resources");
					expect(stdout).to.contain("example-cluster - Running pre-deploy check to Create auth-svc");
					expect(stdout).to.contain("example-cluster - service \"auth-svc\" created");
					expect(stdout).to.contain("example-cluster - Service:auth-svc is available");
					expect(stdout).to.contain("Sending payload to http://example.com/test/auth-svc for auth-svc with status COMPLETED/SUCCESS");
					expect(stdout).to.contain("Finished successfully");
					expect(stdout).to.contain("Deleted tmp directory:");
					done();
				});
			});
		});

		describe("and when running same deploy again (no differences)", function() {
			it("should deploy nothing and send webhooks", function(done) {
				process.env.CONFIGS = kubeconfigFile;

				exec("./src/deployer", function(error, stdout, stderr) {
					expect(error).to.be.a("null", stdout);
					expect(stderr).to.be.empty;
					expect(stdout).not.to.be.empty;
					expect(stdout).to.contain("Generating tmp directory:");
					expect(stdout).to.contain("example-cluster - Strategy rolling-update");
					expect(stdout).to.contain("example-cluster - Getting list of namespaces");
					expect(stdout).not.to.contain("example-cluster - Create example namespace");
					expect(stdout).not.to.contain("example-cluster - namespace \"example\" created");
					// expect(stdout).to.contain("Sending payload to http://example.com/test/auth-svc for auth-svc with status STARTED/IN_PROGRESS");
					expect(stdout).to.contain("example-cluster - Getting list of service matching 'app in (test)'");
					expect(stdout).not.to.contain("example-cluster - Running pre-deploy check to Create auth-svc");
					expect(stdout).not.to.contain("example-cluster - service \"auth-svc\" created");
					// expect(stdout).to.contain("example-cluster - Service:auth-svc is available");
					// expect(stdout).to.contain("Sending payload to http://example.com/test/auth-svc for auth-svc with status COMPLETED/SUCCESS");
					expect(stdout).to.contain("Finished successfully");
					// expect(stdout).to.contain("Deleted tmp directory:");
					done();
				});
			});
		});

		after(function() {
			return clean(kubeconfigFile, "example");
		});
	});

	describe("when deploying to example cluster", function() {
		const kubeconfigFile = "/test/functional/clusters/configs/example-kubeconfig.yaml";
		describe("and exceeding AVAILABLE_TIMEOUT", function() {
			it("should trigger a TimeoutError", function(done) {
				process.env.CONFIGS = kubeconfigFile;
				process.env.AVAILABLE_TIMEOUT = 1;

				exec("./src/deployer", function(error, stdout, stderr) {
					expect(stdout).not.to.be.empty;
					expect(stdout).to.contain("Sending payload to http://example.com/test/auth-svc for auth-svc with status STARTED/IN_PROGRESS");
					expect(stdout).to.contain("Sending payload to http://example.com/test/auth-svc for auth-svc with status COMPLETED/FAILURE");
					expect(stdout).to.match(/.*TimeoutError*/);
					done();
				});
			});
		});

		after(function() {
			return clean(kubeconfigFile, "example");
		});
	});

	describe("when deploying to badimage cluster", function() {
		const kubeconfigFile = "/test/functional/clusters/configs/badimage-kubeconfig.yaml";
		describe("and deployment fails because of image pull errors", function() {
			it("should trigger a health check failure", function(done) {
				process.env.CONFIGS = kubeconfigFile;

				exec("./src/deployer", function(error, stdout, stderr) {
					expect(stdout).not.to.be.empty;
					expect(stdout).to.match(/Healthcheck detected \w+ error occurred \d+ times for badimage-deployment/);
					expect(stdout).to.match(/Healthcheck detected \w+ error exceeded threshold of \d+ for badimage-deployment/);
					expect(stdout).to.match(/Healthcheck grace period of \d+ms expired/);
					expect(stdout).to.contain("Stopping healthcheck watcher");
					expect(stdout).to.contain("Clearing healthcheck timeout");
					expect(stdout).to.match(/EventError: [\w\s"\/\-:(){}\\]+ for badimage-deployment-/);
					expect(stdout).to.contain("Sending payload to http://example.com/test/badimage-deployment for badimage-deployment with status STARTED/IN_PROGRESS");
					expect(stdout).to.contain("Sending payload to http://example.com/test/badimage-deployment for badimage-deployment with status COMPLETED/FAILURE");
					done();
				});
			});
		});

		after(function() {
			return clean(kubeconfigFile, "badimage");
		});
	});

	describe("when deploying multiple deployments cluster", function() {
		const kubeconfigFile = "/test/functional/clusters/configs/multi-deployments-kubeconfig.yaml";
		describe("and multi-deployments cluster does not exist yet", function() {
			it("should deploy without error", function(done) {
				process.env.CONFIGS = kubeconfigFile;

				exec("./src/deployer", function(error, stdout, stderr) {
					expect(error).to.be.a("null", stdout);
					expect(stderr).to.be.empty;
					expect(stdout).not.to.be.empty;
					expect(stdout).to.contain("Generating tmp directory:");
					expect(stdout).to.contain("multi-deployments-cluster - Strategy rolling-update");
					expect(stdout).to.contain("multi-deployments-cluster - Getting list of namespaces");
					expect(stdout).to.contain("multi-deployments-cluster - Create multi-deployments namespace");
					expect(stdout).to.contain("multi-deployments-cluster - namespace \"multi-deployments\" created");
					expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status STARTED/IN_PROGRESS");
					expect(stdout).to.contain("Sending payload to http://example.com/test/nginx2-deployment for nginx2-deployment with status STARTED/IN_PROGRESS");
					expect(stdout).to.contain("multi-deployments-cluster - Getting list of deployment matching 'app in (test)'");
					expect(stdout).to.contain("multi-deployments-cluster - Found 0 resources");
					expect(stdout).to.contain("multi-deployments-cluster - Running pre-deploy check to Create nginx1-deployment");
					expect(stdout).to.contain("multi-deployments-cluster - Running pre-deploy check to Create nginx2-deployment");
					expect(stdout).to.contain("multi-deployments-cluster - deployment \"nginx1-deployment\" created");
					expect(stdout).to.contain("multi-deployments-cluster - deployment \"nginx2-deployment\" created");
					expect(stdout).to.contain("multi-deployments-cluster - Deployment:nginx1-deployment is available");
					expect(stdout).to.contain("multi-deployments-cluster - Deployment:nginx2-deployment is available");
					expect(stdout).to.contain("multi-deployments-cluster - Deployment:nginx1-deployment has 1/1 replicas available");
					expect(stdout).to.contain("multi-deployments-cluster - Deployment:nginx2-deployment has 1/1 replicas available");
					expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status COMPLETED/SUCCESS");
					expect(stdout).to.contain("Sending payload to http://example.com/test/nginx2-deployment for nginx2-deployment with status COMPLETED/SUCCESS");
					expect(stdout).to.contain("Finished successfully");
					expect(stdout).to.contain("Deleted tmp directory:");
					done();
				});
			});
		});

		describe("and multi-deployments cluster has already been deployed", function() {
			it("should deploy nothing and send webhooks", function(done) {
				process.env.CONFIGS = kubeconfigFile;

				exec("./src/deployer", function(error, stdout, stderr) {
					expect(error).to.be.a("null", stdout);
					expect(stderr).to.be.empty;
					expect(stdout).not.to.be.empty;
					expect(stdout).to.contain("Generating tmp directory:");
					expect(stdout).to.contain("multi-deployments-cluster - Strategy rolling-update");
					expect(stdout).to.contain("multi-deployments-cluster - Getting list of namespaces");
					expect(stdout).not.to.contain("multi-deployments-cluster - Create multi-deployments namespace");
					expect(stdout).not.to.contain("multi-deployments-cluster - namespace \"multi-deployments\" created");
					expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status STARTED/IN_PROGRESS");
					expect(stdout).to.contain("Sending payload to http://example.com/test/nginx2-deployment for nginx2-deployment with status STARTED/IN_PROGRESS");
					expect(stdout).to.contain("multi-deployments-cluster - Getting list of deployment matching 'app in (test)'");
					expect(stdout).to.contain("multi-deployments-cluster - Found 2 resources");
					expect(stdout).not.to.contain("multi-deployments-cluster - Running pre-deploy check to Create nginx1-deployment");
					expect(stdout).not.to.contain("multi-deployments-cluster - Running pre-deploy check to Create nginx2-deployment");
					expect(stdout).not.to.contain("multi-deployments-cluster - deployment \"nginx1-deployment\" created");
					expect(stdout).not.to.contain("multi-deployments-cluster - deployment \"nginx2-deployment\" created");
					expect(stdout).to.contain("multi-deployments-cluster - Deployment:nginx1-deployment is available");
					expect(stdout).to.contain("multi-deployments-cluster - Deployment:nginx2-deployment is available");
					expect(stdout).to.contain("multi-deployments-cluster - Deployment:nginx1-deployment has 1/1 replicas available");
					expect(stdout).to.contain("multi-deployments-cluster - Deployment:nginx2-deployment has 1/1 replicas available");
					expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status COMPLETED/SUCCESS");
					expect(stdout).to.contain("Sending payload to http://example.com/test/nginx2-deployment for nginx2-deployment with status COMPLETED/SUCCESS");
					expect(stdout).to.contain("Finished successfully");
					expect(stdout).to.contain("Deleted tmp directory:");
					done();
				});
			});
		});

		after(function() {
			return clean(kubeconfigFile, "multi-deployments");
		});
	});

	describe("when deploying mix deployment and service cluster", function() {
		const clusterName = "mix-deployment-service-cluster";
		const kubeconfigFile = "/test/functional/clusters/configs/mix-deployment-service-kubeconfig.yaml";
		describe("and mix-deployment-service cluster does not exist yet", function() {
			it("should deploy without error", function(done) {
				process.env.CONFIGS = kubeconfigFile;

				exec("./src/deployer", function(error, stdout, stderr) {
					expect(error).to.be.a("null", stdout);
					expect(stderr).to.be.empty;
					expect(stdout).not.to.be.empty;
					expect(stdout).to.contain("Generating tmp directory:");
					expect(stdout).to.contain(clusterName + " - Strategy rolling-update");
					expect(stdout).to.contain(clusterName + " - Getting list of namespaces");
					expect(stdout).to.contain(clusterName + " - Create mix-deployment-service namespace");
					expect(stdout).to.contain(clusterName + " - namespace \"mix-deployment-service\" created");
					expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status STARTED/IN_PROGRESS");
					expect(stdout).to.contain("Sending payload to http://example.com/test/auth-svc for auth-svc with status STARTED/IN_PROGRESS");
					expect(stdout).to.contain(clusterName + " - Getting list of deployment,service matching 'app in (test)'");
					expect(stdout).to.contain(clusterName + " - Found 0 resources");
					expect(stdout).to.contain(clusterName + " - Running pre-deploy check to Create nginx1-deployment");
					expect(stdout).to.contain(clusterName + " - Running pre-deploy check to Create auth-svc");
					expect(stdout).to.contain(clusterName + " - deployment \"nginx1-deployment\" created");
					expect(stdout).to.contain(clusterName + " - service \"auth-svc\" created");
					expect(stdout).to.contain(clusterName + " - Deployment:nginx1-deployment is available");
					expect(stdout).to.contain(clusterName + " - Service:auth-svc is available");
					expect(stdout).to.contain(clusterName + " - Deployment:nginx1-deployment has 1/1 replicas available");
					expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status COMPLETED/SUCCESS");
					expect(stdout).to.contain("Sending payload to http://example.com/test/auth-svc for auth-svc with status COMPLETED/SUCCESS");
					expect(stdout).to.contain("Finished successfully");
					expect(stdout).to.contain("Deleted tmp directory:");
					done();
				});
			});
		});

		describe("and mix-deployment-service cluster has already been deployed", function() {
			it("should deploy nothing and send webhooks", function(done) {
				process.env.CONFIGS = kubeconfigFile;

				exec("./src/deployer", function(error, stdout, stderr) {
					expect(error).to.be.a("null", stdout);
					expect(stderr).to.be.empty;
					expect(stdout).not.to.be.empty;
					expect(stdout).to.contain("Generating tmp directory:");
					expect(stdout).to.contain(clusterName + " - Strategy rolling-update");
					expect(stdout).to.contain(clusterName + " - Getting list of namespaces");
					expect(stdout).not.to.contain(clusterName + " - Create mix-deployment-service namespace");
					expect(stdout).not.to.contain(clusterName + " - namespace \"mix-deployment-service\" created");
					expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status STARTED/IN_PROGRESS");
					// expect(stdout).to.contain("Sending payload to http://example.com/test/auth-svc for auth-svc with status STARTED/IN_PROGRESS");
					expect(stdout).to.contain(clusterName + " - Getting list of deployment,service matching 'app in (test)'");
					expect(stdout).to.contain(clusterName + " - Found 2 resources");
					expect(stdout).not.to.contain(clusterName + " - Running pre-deploy check to Create nginx1-deployment");
					expect(stdout).not.to.contain(clusterName + " - Running pre-deploy check to Create auth-svc");
					expect(stdout).not.to.contain(clusterName + " - deployment \"nginx1-deployment\" created");
					expect(stdout).not.to.contain(clusterName + " - service \"auth-svc\" created");
					expect(stdout).to.contain(clusterName + " - Deployment:nginx1-deployment is available");
					// expect(stdout).to.contain(clusterName + " - Service:auth-svc is available");
					expect(stdout).to.contain(clusterName + " - Deployment:nginx1-deployment has 1/1 replicas available");
					expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status COMPLETED/SUCCESS");
					// expect(stdout).to.contain("Sending payload to http://example.com/test/auth-svc for auth-svc with status COMPLETED/SUCCESS");
					expect(stdout).to.contain("Finished successfully");
					expect(stdout).to.contain("Deleted tmp directory:");
					done();
				});
			});
		});

		after(function() {
			return clean(kubeconfigFile, "mix-deployment-service");
		});
	});

	describe("when deploying deployment and service cluster using fast-rollback strategy", function() {
		const firstKubeconfigFile = "/test/functional/clusters/configs/fast-rollback-kubeconfig-0.yaml";
		describe("and fast-rollback-service cluster manually deployed without strategy", function() {
			var clusterName = "fast-rollback-cluster-0";
			it("should deploy without error", function(done) {
				process.env.CONFIGS = firstKubeconfigFile;
				delete process.env.DEPLOY_ID;

				exec(`./bin/kubectl --kubeconfig=.${firstKubeconfigFile} create --save-config=true -f ./test/functional/clusters/namespaces/fast-rollback-cluster-0/fast-rollback-namespace.yaml`, function(error, stdout, stderr) {
					expect(error).to.be.a("null", stdout);
					expect(stderr).to.be.empty;
					expect(stdout).not.to.be.empty;
					expect(stdout).to.contain(`namespace "fast-rollback" created`);
					exec(`./bin/kubectl --kubeconfig=.${firstKubeconfigFile} create --save-config=true -f ./test/functional/clusters/manifests/fast-rollback-cluster-0`, function(error, stdout, stderr) {
						expect(error).to.be.a("null", stdout);
						expect(stderr).to.be.empty;
						expect(stdout).not.to.be.empty;
						expect(stdout).to.contain(`deployment "nginx1-deployment" created`);
						expect(stdout).to.contain(`service "nginx1-svc" created`);
						done();
					});
				});
			});
		});
		describe("and fast-rollback-service cluster with NO deployId and using rolling-update first", function() {
			var clusterName = "fast-rollback-cluster-0";
			it("should deploy without error", function(done) {
				process.env.CONFIGS = firstKubeconfigFile;
				process.env.STRATEGY = "rolling-update";
				delete process.env.DEPLOY_ID;

				exec("./src/deployer", function(error, stdout, stderr) {
					expect(error).to.be.a("null", stdout);
					expect(stderr).to.be.empty;
					expect(stdout).not.to.be.empty;
					expect(stdout).to.contain("Generating tmp directory:");
					expect(stdout).to.contain(clusterName + " - Strategy rolling-update");
					expect(stdout).to.contain(clusterName + " - Getting list of namespaces");
					expect(stdout).not.to.contain(clusterName + " - Create fast-rollback namespace");
					expect(stdout).to.contain(clusterName + ` - deployment "nginx1-deployment" configured`);
					expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status STARTED/IN_PROGRESS");
					// expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-svc for nginx1-svc with status STARTED/IN_PROGRESS");
					expect(stdout).to.contain(clusterName + " - Getting list of deployment,service matching 'app in (test)'");
					expect(stdout).to.contain(clusterName + " - Found 2 resources");
					expect(stdout).to.contain(clusterName + " - Running pre-deploy check to Apply nginx1-deployment");
					expect(stdout).to.contain(clusterName + " - Running pre-deploy check to Apply nginx1-svc");
					expect(stdout).to.contain(clusterName + " - deployment \"nginx1-deployment\" configured");
					expect(stdout).to.contain(clusterName + " - Strategy rolling-update waiting for all deployments to be available before deploying service nginx1-svc");
					expect(stdout).to.contain(clusterName + " - Deployment:nginx1-deployment is available");
					// expect(stdout).to.contain(clusterName + " - Service:nginx1-svc is available");
					expect(stdout).to.contain(clusterName + " - Deployment:nginx1-deployment has 1/1 replicas available");
					expect(stdout).to.contain(clusterName + " - Strategy rolling-update all 2 manifests are available");
					expect(stdout).to.contain(clusterName + " - Strategy rolling-update successfully deployed nginx1-svc service after all deployments were available");
					expect(stdout).to.contain(clusterName + " - Strategy rolling-update deployed 1 services after all deployments available");
					expect(stdout).to.contain(clusterName + " - Strategy rolling-update cleanup attempting to delete 0 deployments that match the nginx1-deployment deployment group label name=nginx1-pod,strategy!=rolling-update");
					// TODO: expect(stdout).to.contain(clusterName + " - Strategy rolling-update cleanup attempting to delete 1 replicasets that match the nginx1-deployment deployment group label name=nginx1-pod,strategy!=rolling-update");
					// TODO: expect(stdout).to.contain(clusterName + " - Strategy rolling-update cleanup deleted replicaset nginx1-deployment-");
					// TODO: expect(stdout).to.contain(clusterName + " - Strategy rolling-update cleanup successfully deleted 1 replicasets");
					expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status COMPLETED/SUCCESS");
					// expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-svc for nginx1-svc with status COMPLETED/SUCCESS");
					expect(stdout).to.contain("Finished successfully");
					expect(stdout).to.contain("Deleted tmp directory:");
					done();
				});
			});
		});
		describe("and fast-rollback-service cluster with NO deployId", function() {
			var clusterName = "fast-rollback-cluster-0";
			it("should deploy without error", function(done) {
				process.env.CONFIGS = firstKubeconfigFile;
				process.env.STRATEGY = "fast-rollback";
				delete process.env.DEPLOY_ID;

				exec("./src/deployer", function(error, stdout, stderr) {
					expect(error).to.be.a("null", stdout);
					expect(stderr).to.be.empty;
					expect(stdout).not.to.be.empty;
					expect(stdout).to.contain("Generating tmp directory:");
					expect(stdout).to.contain(clusterName + " - Strategy fast-rollback");
					expect(stdout).to.contain(clusterName + " - Getting list of namespaces");
					expect(stdout).not.to.contain(clusterName + " - Create fast-rollback namespace");
					expect(stdout).not.to.contain(clusterName + " - namespace \"fast-rollback\" created");
					expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status STARTED/IN_PROGRESS");
					// expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-svc for nginx1-svc with status STARTED/IN_PROGRESS");
					expect(stdout).to.contain(clusterName + " - Getting list of deployment,service matching 'app in (test)'");
					expect(stdout).to.contain(clusterName + " - Found 2 resources");
					expect(stdout).to.contain(clusterName + " - Running pre-deploy check to Create nginx1-deployment-unspecified");
					expect(stdout).to.contain(clusterName + " - deployment \"nginx1-deployment-unspecified\" created");
					expect(stdout).to.contain(clusterName + " - Strategy fast-rollback waiting for all deployments to be available before deploying service nginx1-svc");
					expect(stdout).to.contain(clusterName + " - Deployment:nginx1-deployment-unspecified is available");
					// expect(stdout).to.contain(clusterName + " - Service:nginx1-svc is available");
					expect(stdout).to.contain(clusterName + " - Deployment:nginx1-deployment-unspecified has 1/1 replicas available");
					expect(stdout).to.contain(clusterName + " - Strategy fast-rollback all 2 manifests are available");
					expect(stdout).to.contain(clusterName + " - Strategy fast-rollback verified 1 pods match the service selector name=nginx1-pod,id=unspecified,strategy=fast-rollback");
					expect(stdout).to.contain(clusterName + " - Strategy fast-rollback successfully deployed nginx1-svc service after all deployments were available");
					expect(stdout).to.contain(clusterName + " - Strategy fast-rollback deployed 1 services after all deployments available");
					expect(stdout).to.contain(clusterName + " - Strategy fast-rollback deleteNewer found 0 deployments that match the nginx1-deployment-unspecified deployment group label name=nginx1-pod,id!=unspecified,strategy=fast-rollback");
					expect(stdout).to.contain(clusterName + " - Strategy fast-rollback attempting to delete 0 deployments newer than nginx1-deployment-unspecified");
					expect(stdout).to.contain(clusterName + " - Strategy fast-rollback deleteBackups found 0 backup deployments on reserve that match the nginx1-deployment-unspecified deployment group label name=nginx1-pod,id!=unspecified,strategy=fast-rollback");
					expect(stdout).to.contain(clusterName + " - Strategy fast-rollback skipping delete of older deployments because insufficent backup deployments on reserve");
					expect(stdout).to.contain(clusterName + " - Strategy fast-rollback cleanup attempting to delete 1 deployments that match the nginx1-deployment-unspecified deployment group label name=nginx1-pod,strategy!=fast-rollback");
					expect(stdout).to.contain(clusterName + " - Strategy fast-rollback cleanup deleted deployment nginx1-deployment");
					expect(stdout).to.contain(clusterName + " - Strategy fast-rollback cleanup successfully deleted 1 deployments");
					expect(stdout).to.contain(clusterName + " - Strategy fast-rollback cleanup attempting to delete 0 replicasets that match the nginx1-deployment-unspecified deployment group label name=nginx1-pod,strategy!=fast-rollback");
					expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status COMPLETED/SUCCESS");
					// expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-svc for nginx1-svc with status COMPLETED/SUCCESS");
					expect(stdout).to.contain("Finished successfully");
					expect(stdout).to.contain("Deleted tmp directory:");
					done();
				});
			});
		});

		const deployIds = ["dep-1", "dep-2", "dep-3", "dep-4", "dep-5"];
		_.each(deployIds, (id, index) => {
			var clusterName = "fast-rollback-cluster-" + (index+1);
			var kubeconfigFile = "/test/functional/clusters/configs/fast-rollback-kubeconfig-" + (index+1) +".yaml";
			describe("and fast-rollback-service cluster deployId=" + id, function() {
				it("should deploy without error", function(done) {
					process.env.CONFIGS = kubeconfigFile;
					process.env.STRATEGY = "fast-rollback";
					process.env.DEPLOY_ID = id;

					exec("./src/deployer", function(error, stdout, stderr) {
						expect(error).to.be.a("null", stdout);
						expect(stderr).to.be.empty;
						expect(stdout).not.to.be.empty;
						expect(stdout).to.contain("Generating tmp directory:");
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback");
						expect(stdout).to.contain(clusterName + " - Getting list of namespaces");
						expect(stdout).not.to.contain(clusterName + " - Create fast-rollback namespace");
						expect(stdout).not.to.contain(clusterName + " - namespace \"fast-rollback\" created");
						expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status STARTED/IN_PROGRESS");
						expect(stdout).to.contain(clusterName + " - Getting list of deployment,service matching 'app in (test)'");
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback annotating nginx1-svc");
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback annotating nginx1-deployment");
						expect(stdout).to.contain(clusterName + " - Differences for nginx1-svc");
						expect(stdout).to.contain(clusterName + " - Running pre-deploy check to Create nginx1-deployment-" + process.env.DEPLOY_ID);
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback waiting for all deployments to be available before deploying service nginx1-svc");
						expect(stdout).to.contain(clusterName + " - Running pre-deploy check to Apply nginx1-svc");
						expect(stdout).to.contain(clusterName + " - deployment \"nginx1-deployment-" + process.env.DEPLOY_ID + "\" created");
						expect(stdout).to.contain(clusterName + " - Deployment:nginx1-deployment-" + process.env.DEPLOY_ID + " is available");
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback all 2 manifests are available");
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback verified 1 pods match the service selector name=nginx1-pod,id=" + id);
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback successfully deployed nginx1-svc service after all deployments were available");
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback deployed 1 services after all deployments available");
						if (index < 3) {
							expect(stdout).to.contain(clusterName + " - Strategy fast-rollback deleteNewer found " + (index+1) + " deployments that match the nginx1-deployment-dep-" + (index+1) + " deployment group label name=nginx1-pod,id!=" + id + ",strategy=fast-rollback");
							expect(stdout).to.contain(clusterName + " - Strategy fast-rollback attempting to delete 0 deployments newer than nginx1-deployment-dep-" + (index+1));
							expect(stdout).to.contain(clusterName + " - Strategy fast-rollback deleteBackups found " + (index+1) + " backup deployments on reserve that match the nginx1-deployment-dep-" + (index+1) + " deployment group label name=nginx1-pod,id!=" + id + ",strategy=fast-rollback");
							expect(stdout).to.contain(clusterName + " - Found " + (index+2) + " resources");
							expect(stdout).to.contain(clusterName + " - Strategy fast-rollback skipping delete of older deployments because insufficent backup deployments on reserve");
						} else {
							// expect(stdout).to.contain(clusterName + " - Found 5 resources");
							expect(stdout).to.contain(clusterName + " - Strategy fast-rollback deleteNewer found 4 deployments that match the nginx1-deployment-dep-" + (index+1) + " deployment group label name=nginx1-pod,id!=" + id + ",strategy=fast-rollback");
							expect(stdout).to.contain(clusterName + " - Strategy fast-rollback attempting to delete 0 deployments newer than nginx1-deployment-dep-" + (index+1));
							expect(stdout).to.contain(clusterName + " - Strategy fast-rollback deleteBackups found 4 backup deployments on reserve that match the nginx1-deployment-dep-" + (index+1) + " deployment group label name=nginx1-pod,id!=" + id + ",strategy=fast-rollback");
							expect(stdout).to.contain(clusterName + " - Strategy fast-rollback attempting to delete 1 deployments older than nginx1-deployment-dep-" + (index+1));
							if (index == 3) {
								expect(stdout).to.contain(clusterName + " - Strategy fast-rollback deleted backup deployment nginx1-deployment");
							} else {
								expect(stdout).to.contain(clusterName + " - Strategy fast-rollback deleted backup deployment nginx1-deployment-dep-" + (index-3));
							}
							expect(stdout).to.contain(clusterName + " - Strategy fast-rollback successfully deleted 1 deployments older than nginx1-deployment-dep-" + (index+1));
						}
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback cleanup attempting to delete 0 deployments that match the nginx1-deployment-dep-" + (index+1) + " deployment group label name=nginx1-pod,strategy!=fast-rollback");
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback cleanup attempting to delete 0 replicasets that match the nginx1-deployment-dep-" + (index+1) + " deployment group label name=nginx1-pod,strategy!=fast-rollback");
						expect(stdout).to.contain(clusterName + " - Deployment:nginx1-deployment-" + process.env.DEPLOY_ID + " has 1/1 replicas available");
						expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status COMPLETED/SUCCESS");
						expect(stdout).to.contain("Finished successfully");
						expect(stdout).to.contain("Deleted tmp directory:");
						done();
					});
				});
			});
		});

		describe("and rolling back fast-rollback-service cluster to a reserve backup", function() {
			var clusterName = "fast-rollback-cluster-3";
			var kubeconfigFile = "/test/functional/clusters/configs/fast-rollback-kubeconfig-3.yaml";
			var id = "dep-3";
			describe("to deployId=" + id, function() {
				it("should deploy without error", function(done) {
					process.env.CONFIGS = kubeconfigFile;
					process.env.STRATEGY = "fast-rollback";
					process.env.DEPLOY_ID = id;
					process.env.IS_ROLLBACK = "true";
			
					exec("./src/deployer", function(error, stdout, stderr) {
						expect(error).to.be.a("null", stdout);
						expect(stderr).to.be.empty;
						expect(stdout).not.to.be.empty;
						expect(stdout).to.contain("Generating tmp directory:");
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback");
						expect(stdout).to.contain(clusterName + " - Getting list of namespaces");
						expect(stdout).not.to.contain(clusterName + " - Create fast-rollback namespace");
						expect(stdout).not.to.contain(clusterName + " - namespace \"fast-rollback\" created");
						expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status STARTED/IN_PROGRESS");
						expect(stdout).to.contain(clusterName + " - Getting list of deployment,service matching 'app in (test)'");
						expect(stdout).to.contain(clusterName + " - Found 5 resources");
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback annotating nginx1-svc");
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback annotating nginx1-deployment");
						expect(stdout).to.contain(clusterName + " - Differences for nginx1-svc");
						expect(stdout).not.to.contain(clusterName + " - Running pre-deploy check to Create nginx1-deployment-" + process.env.DEPLOY_ID);
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback deployment nginx1-deployment-" + id + " already exists in the cluster so skipping");
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback waiting for all deployments to be available before deploying service nginx1-svc");
						expect(stdout).to.contain(clusterName + " - Running pre-deploy check to Apply nginx1-svc");
						expect(stdout).not.to.contain(clusterName + " - deployment \"nginx1-deployment-" + process.env.DEPLOY_ID + "\" created");
						expect(stdout).to.contain(clusterName + " - Deployment:nginx1-deployment-" + process.env.DEPLOY_ID + " is available");
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback all 2 manifests are available");
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback verified 1 pods match the service selector name=nginx1-pod,id=" + id);
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback successfully deployed nginx1-svc service after all deployments were available");
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback deployed 1 services after all deployments available");
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback deleteNewer found 3 deployments that match the nginx1-deployment-dep-3 deployment group label name=nginx1-pod,id!=dep-3,strategy=fast-rollback");
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback attempting to delete 2 deployments newer than nginx1-deployment-dep-3");
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback deleted newer deployment nginx1-deployment-dep-4");
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback deleted newer deployment nginx1-deployment-dep-5");
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback successfully deleted 2 deployments newer than nginx1-deployment-dep-3");
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback deleteBackups found 1 backup deployments on reserve that match the nginx1-deployment-dep-3 deployment group label name=nginx1-pod,id!=dep-3,strategy=fast-rollback");
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback skipping delete of older deployments because insufficent backup deployments on reserve");
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback cleanup attempting to delete 0 deployments that match the nginx1-deployment-dep-3 deployment group label name=nginx1-pod,strategy!=fast-rollback");
						expect(stdout).to.contain(clusterName + " - Strategy fast-rollback cleanup attempting to delete 0 replicasets that match the nginx1-deployment-dep-3 deployment group label name=nginx1-pod,strategy!=fast-rollback");
						expect(stdout).to.contain(clusterName + " - Deployment:nginx1-deployment-" + process.env.DEPLOY_ID + " has 1/1 replicas available");
						expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status COMPLETED/SUCCESS");
						expect(stdout).to.contain("Finished successfully");
						expect(stdout).to.contain("Deleted tmp directory:");
						done();
					});
				});
			});
		});
		describe("and switching back to rolling-update", function() {
			var clusterName = "fast-rollback-cluster-0";
			var kubeconfigFile = "/test/functional/clusters/configs/fast-rollback-kubeconfig-0.yaml";
			var id = "dep-0";
			describe("to deployId=" + id, function() {
				it("should deploy without error", function(done) {
					process.env.CONFIGS = kubeconfigFile;
					process.env.STRATEGY = "rolling-update";
					process.env.DEPLOY_ID = id;
					process.env.IS_ROLLBACK = "false";
			
					exec("./src/deployer", function(error, stdout, stderr) {
						expect(error).to.be.a("null", stdout);
						expect(stderr).to.be.empty;
						expect(stdout).not.to.be.empty;
						expect(stdout).to.contain("Generating tmp directory:");
						expect(stdout).to.contain(clusterName + " - Strategy rolling-update");
						expect(stdout).to.contain(clusterName + " - Getting list of namespaces");
						expect(stdout).not.to.contain(clusterName + " - Create fast-rollback namespace");
						expect(stdout).not.to.contain(clusterName + " - namespace \"fast-rollback\" created");
						expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status STARTED/IN_PROGRESS");
						expect(stdout).to.contain(clusterName + " - Getting list of deployment,service matching 'app in (test)'");
						expect(stdout).to.contain(clusterName + " - Found 3 resources");
						expect(stdout).to.contain(clusterName + " - Strategy rolling-update annotating nginx1-svc");
						expect(stdout).to.contain(clusterName + " - Strategy rolling-update annotating nginx1-deployment");
						expect(stdout).to.contain(clusterName + " - Differences for nginx1-svc");
						expect(stdout).to.contain(clusterName + " - Running pre-deploy check to Create nginx1-deployment");
						expect(stdout).to.contain(clusterName + " - Strategy rolling-update waiting for all deployments to be available before deploying service nginx1-svc");
						expect(stdout).to.contain(clusterName + " - Running pre-deploy check to Apply nginx1-svc");
						expect(stdout).to.contain(clusterName + " - deployment \"nginx1-deployment\" created");
						expect(stdout).to.contain(clusterName + " - Deployment:nginx1-deployment has 1/1 replicas available");
						expect(stdout).to.contain(clusterName + " - Deployment:nginx1-deployment is available");
						expect(stdout).to.contain(clusterName + " - Strategy rolling-update all 2 manifests are available");
						expect(stdout).to.contain(clusterName + " - Strategy rolling-update successfully deployed nginx1-svc service after all deployments were available");
						expect(stdout).to.contain(clusterName + " - Strategy rolling-update deployed 1 services after all deployments available");
						expect(stdout).to.contain(clusterName + " - Strategy rolling-update cleanup attempting to delete 2 deployments that match the nginx1-deployment deployment group label name=nginx1-pod,strategy!=rolling-update");
						expect(stdout).to.contain(clusterName + " - Strategy rolling-update cleanup deleted deployment nginx1-deployment-dep-2");
						expect(stdout).to.contain(clusterName + " - Strategy rolling-update cleanup deleted deployment nginx1-deployment-dep-3");
						expect(stdout).to.contain(clusterName + " - Strategy rolling-update cleanup successfully deleted 2 deployments");
						// TODO: expect(stdout).to.contain(clusterName + " - Strategy rolling-update cleanup attempting to delete 0 replicasets that match the nginx1-deployment deployment group label name=nginx1-pod,strategy!=rolling-update");
						expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status COMPLETED/SUCCESS");
						expect(stdout).to.contain("Finished successfully");
						expect(stdout).to.contain("Deleted tmp directory:");
						done();
					});
				});
			});
		});
		after(function() {
			return clean(firstKubeconfigFile, "fast-rollback");
		});
	});

	describe("when no unique namespaces and deploying to cluster", function() {
		it("should deploy without error", function(done) {
			process.env.CONFIGS = "/test/functional/clusters/configs/no-namespaces-kubeconfig.yaml";

			exec("./src/deployer", function(error, stdout, stderr) {
				expect(error).to.be.a("null", stdout);
				expect(stderr).to.be.empty;
				expect(stdout).not.to.be.empty;
				expect(stdout).not.to.contain("Generating tmp directory:");
				expect(stdout).to.contain("no-namespaces-cluster - Strategy rolling-update");
				expect(stdout).to.contain("no-namespaces-cluster - No namespace files to processs, skipping no-namespaces-cluster");
				expect(stdout).to.contain("no-namespaces-cluster - No cluster files to processs, skipping no-namespaces-cluster");
				expect(stdout).to.contain("no-namespaces-cluster - Deleted tmp directory:");
				expect(stdout).to.contain("Finished successfully");
				done();
			});
		});
	});

	describe("when deploying a single job to a cluster", function() {
		const kubeconfigFile = "/test/functional/clusters/configs/single-job-kubeconfig.yaml";
		it("should deploy without error", function(done) {
			process.env.CONFIGS = kubeconfigFile;

			exec("./src/deployer", function(error, stdout, stderr) {
				expect(error).to.be.a("null", stdout);
				expect(stderr).to.be.empty;
				expect(stdout).not.to.be.empty;
				expect(stdout).to.contain("Generating tmp directory:");
				expect(stdout).to.contain("single-job-cluster - Strategy rolling-update");
				expect(stdout).to.contain("single-job-cluster - Getting list of namespaces");
				expect(stdout).to.contain("Sending payload to http://example.com/test/ls-job for ls-job with status STARTED/IN_PROGRESS");
				expect(stdout).to.contain("single-job-cluster - Getting list of job matching 'app in (test)'");
				expect(stdout).to.contain("single-job-cluster - Create single-job namespace");
				expect(stdout).to.contain("single-job-cluster - namespace \"single-job\" created");
				expect(stdout).to.contain("single-job-cluster - Found 0 resources");
				expect(stdout).to.contain("single-job-cluster - Running pre-deploy check to Create ls-job");
				expect(stdout).to.match(/.*single-job-cluster - job \"ls-job-\b[0-9a-f]{5,40}\b\" created*/);
				expect(stdout).to.match(/.*single-job-cluster - Job:ls-job-\b[0-9a-f]{5,40}\b is available.*/);
				expect(stdout).to.match(/.*single-job-cluster - Job:ls-job-\b[0-9a-f]{5,40}\b has 1\/1 succeeded.*/);
				expect(stdout).to.contain("Sending payload to http://example.com/test/ls-job for ls-job with status COMPLETED/SUCCESS");
				expect(stdout).to.contain("Finished successfully");
				expect(stdout).to.contain("Deleted tmp directory:");
				done();
			});
		});

		after(function() {
			return clean(kubeconfigFile, "single-job");
		});
	});

	afterEach(function() {
		delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
		delete process.env.SELECTOR;
		delete process.env.DEBUG;
		delete process.env.DRY_RUN;
		delete process.env.DIFF;
		delete process.env.NAMESPACES_DIR;
		delete process.env.MANIFESTS_DIR;
		delete process.env.CONFIGS;
		delete process.env.GITHUB_ENABLED;
		delete process.env.CI_COMMIT_ID;
		delete process.env.AVAILABLE_ENABLED;
		delete process.env.AVAILABLE_ALL;
		delete process.env.AVAILABLE_TIMEOUT;
		delete process.env.AVAILABLE_REQUIRED;
		delete process.env.AVAILABLE_KEEP_ALIVE;
		delete process.env.AVAILABLE_WEB;
		delete process.env.STRATEGY;
		delete process.env.DEPLOY_ID;
	});
});
