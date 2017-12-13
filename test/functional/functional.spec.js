"use strict";

const exec = require("child_process").exec;
const expect = require("chai").expect;
const Kubectl = require("../../src/lib/kubectl");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

function clean(kubeconfigFile, namespace) {
  const cwd = path.dirname(kubeconfigFile);
  const kubectl = new Kubectl({
    backoff: {
      failAfter: parseInt(process.env.BACKOFF_FAIL_AFTER),
      initialDelay: parseInt(process.env.BACKOFF_INITIAL_DELAY),
      maxDelay: parseInt(process.env.BACKOFF_MAX_DELAY)
    },
    cwd: cwd,
    kubeconfig: yaml.safeLoad(fs.readFileSync(kubeconfigFile, "utf8")),
    kubeconfigFile: kubeconfigFile
  });
  return kubectl.deleteByName("namespace", namespace);
}

describe("Functional misc", function() {
  this.timeout(180000);

  beforeEach(function() {
    process.env.UUID = "9543ac65-223e-4746-939f-391231ec64bb";
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    process.env.SELECTOR = "app in (test)";
    process.env.DEBUG = "true";
    process.env.DRY_RUN = "false";
    process.env.DIFF = "true";
    process.env.GITHUB_ENABLED = "false";
    process.env.CI_COMMIT_ID = "6fc66dc2a0b75265ed14e45b754731d8c09b26d6";
    process.env.NAMESPACES_DIR = "/test/functional/clusters/namespaces";
    process.env.MANIFESTS_DIR = "/test/functional/clusters/manifests";
    process.env.BACKOFF_FAIL_AFTER = "3";
    process.env.BACKOFF_INITIAL_DELAY = "100";
    process.env.BACKOFF_MAX_DELAY = "500";
    process.env.AVAILABLE_ENABLED = "true";
    process.env.AVAILABLE_POLLING_INTERVAL = "3";
    process.env.AVAILABLE_HEALTH_CHECK = "true";
    process.env.AVAILABLE_HEALTH_CHECK_GRACE_PERIOD = "3";
    process.env.AVAILABLE_HEALTH_CHECK_THRESHOLD = "1";
    process.env.AVAILABLE_ALL = "true";
    process.env.AVAILABLE_TIMEOUT = "60";
    process.env.AVAILABLE_REQUIRED = "true";
    process.env.AVAILABLE_KEEP_ALIVE = "true";
    process.env.AVAILABLE_WEBHOOK = "http://example.com/test";
    process.env.STRATEGY = "rolling-update";
    process.env.CREATE_ONLY = "false";
  });

  describe("when deploying to example cluster", function() {
    const kubeconfigFile =
      "/test/functional/clusters/configs/example-kubeconfig.yaml";
    describe("and dryRun is enabled and example cluster does not exist yet", function() {
      it("should deploy without error", function(done) {
        process.env.DRY_RUN = "true";
        process.env.CONFIGS = kubeconfigFile;

        exec("./src/deployer", function(error, stdout, stderr) {
          expect(error).to.be.a("null", stdout);
          expect(stderr).to.be.empty;
          expect(stdout).not.to.be.empty;
          expect(stdout).to.contain("Generating tmp directory:");
          expect(stdout).to.contain(
            "example-cluster - Strategy rolling-update"
          );
          expect(stdout).to.contain(
            "example-cluster - Getting list of namespaces"
          );
          expect(stdout).to.contain(
            "example-cluster - Apply example namespace"
          );
          expect(stdout).to.contain(
            "example-cluster - DryRun is enabled: skipping kubectl.apply(/test/functional/clusters/namespaces/example-cluster/example-namespace.yaml)"
          );
          expect(stdout).not.to.contain(
            'example-cluster - namespace "example" created'
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/auth-svc for auth-svc with status STARTED/IN_PROGRESS"
          );
          expect(stdout).to.contain(
            "example-cluster - Getting list of service matching 'app in (test)'"
          );
          expect(stdout).to.contain("example-cluster - Found 0 resources");
          expect(stdout).to.contain(
            "example-cluster - Running pre-deploy check to Apply auth-svc"
          );
          expect(stdout).to.match(
            /.*example-cluster - DryRun is enabled: skipping kubectl\.apply\(\/tmp\/kit-deployer\/9543ac65-223e-4746-939f-391231ec64bb_[0-9a-f-]{5,40}\/example-cluster-auth-svc\.yaml\.json\).*/
          );
          expect(stdout).to.contain(
            "example-cluster - DryRun is enabled: skipping available check for Service:auth-svc"
          );
          expect(stdout).to.contain(
            "example-cluster - Strategy rolling-update all 1 manifests are available"
          );
          expect(stdout).to.contain(
            "example-cluster - Strategy rolling-update deployed 0 services after all deployments available"
          );
          expect(stdout).not.to.contain(
            'example-cluster - service "auth-svc" created'
          );
          expect(stdout).not.to.contain(
            "example-cluster - Service:auth-svc is available"
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/auth-svc for auth-svc with status COMPLETED/SUCCESS"
          );
          expect(stdout).to.contain(
            "This was a dry run and no changes were deployed"
          );
          expect(stdout).to.contain("Finished successfully");
          done();
        });
      });
    });

    describe("and example cluster does not exist yet", function() {
      it("should deploy without error", function(done) {
        process.env.CONFIGS = kubeconfigFile;

        exec("./src/deployer", function(error, stdout, stderr) {
          expect(error).to.be.a("null", stdout);
          expect(stderr).to.be.empty;
          expect(stdout).not.to.be.empty;
          expect(stdout).to.contain("Generating tmp directory:");
          expect(stdout).to.contain(
            "example-cluster - Strategy rolling-update"
          );
          expect(stdout).to.contain(
            "example-cluster - Getting list of namespaces"
          );
          expect(stdout).to.contain(
            "example-cluster - Apply example namespace"
          );
          expect(stdout).to.contain(
            'example-cluster - namespace "example" created'
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/auth-svc for auth-svc with status STARTED/IN_PROGRESS"
          );
          expect(stdout).to.contain(
            "example-cluster - Getting list of service matching 'app in (test)'"
          );
          expect(stdout).to.contain("example-cluster - Found 0 resources");
          expect(stdout).to.contain(
            "example-cluster - Running pre-deploy check to Apply auth-svc"
          );
          expect(stdout).to.contain(
            'example-cluster - service "auth-svc" created'
          );
          expect(stdout).to.contain(
            "example-cluster - Service:auth-svc is available"
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/auth-svc for auth-svc with status COMPLETED/SUCCESS"
          );
          expect(stdout).to.contain("Finished successfully");
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
          expect(stdout).to.contain(
            "example-cluster - Strategy rolling-update"
          );
          expect(stdout).to.contain(
            "example-cluster - Getting list of namespaces"
          );
          expect(stdout).not.to.contain(
            "example-cluster - Apply example namespace"
          );
          expect(stdout).not.to.contain(
            'example-cluster - namespace "example" created'
          );
          // expect(stdout).to.contain("Sending payload to http://example.com/test/auth-svc for auth-svc with status STARTED/IN_PROGRESS");
          expect(stdout).to.contain(
            "example-cluster - Getting list of service matching 'app in (test)'"
          );
          expect(stdout).to.contain(
            "example-cluster - Running pre-deploy check to Apply auth-svc"
          );
          expect(stdout).not.to.contain(
            'example-cluster - service "auth-svc" created'
          );
          // expect(stdout).to.contain("example-cluster - Service:auth-svc is available");
          // expect(stdout).to.contain("Sending payload to http://example.com/test/auth-svc for auth-svc with status COMPLETED/SUCCESS");
          expect(stdout).to.contain("Finished successfully");
          done();
        });
      });
    });

    describe("and when running same deploy again with createOnly", function() {
      it("should skip deployment and send webhooks", function(done) {
        process.env.CONFIGS = kubeconfigFile;
        process.env.CREATE_ONLY = "true";

        exec("./src/deployer", function(error, stdout, stderr) {
          expect(error).to.be.a("null", stdout);
          expect(stderr).to.be.empty;
          expect(stdout).not.to.be.empty;
          expect(stdout).to.contain("Generating tmp directory:");
          expect(stdout).to.contain(
            "example-cluster - Strategy rolling-update"
          );
          expect(stdout).to.contain(
            "example-cluster - Getting list of namespaces"
          );
          expect(stdout).not.to.contain(
            "example-cluster - Apply example namespace"
          );
          expect(stdout).not.to.contain(
            'example-cluster - namespace "example" created'
          );
          expect(stdout).to.contain(
            "example-cluster - Strategy rolling-update skipping deploy of auth-svc because it already exists and createOnly is enabled"
          );
          // expect(stdout).to.contain("Sending payload to http://example.com/test/auth-svc for auth-svc with status STARTED/IN_PROGRESS");
          expect(stdout).to.contain(
            "example-cluster - Getting list of service matching 'app in (test)'"
          );
          expect(stdout).not.to.contain(
            "example-cluster - Running pre-deploy check to Apply auth-svc"
          );
          expect(stdout).not.to.contain(
            'example-cluster - service "auth-svc" created'
          );
          // expect(stdout).to.contain("example-cluster - Service:auth-svc is available");
          // expect(stdout).to.contain("Sending payload to http://example.com/test/auth-svc for auth-svc with status COMPLETED/SUCCESS");
          expect(stdout).to.contain("Finished successfully");
          done();
        });
      });
    });

    after(function() {
      return clean(kubeconfigFile, "example");
    });
  });

  describe("when deploying to example-timeout cluster", function() {
    const kubeconfigFile =
      "/test/functional/clusters/configs/example-timeout-kubeconfig.yaml";
    describe("and exceeding AVAILABLE_TIMEOUT", function() {
      it("should trigger a TimeoutError", function(done) {
        process.env.CONFIGS = kubeconfigFile;
        process.env.AVAILABLE_TIMEOUT = 1;

        exec("./src/deployer", function(error, stdout) {
          expect(stdout).not.to.be.empty;
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/auth-svc for auth-svc with status STARTED/IN_PROGRESS"
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/auth-svc for auth-svc with status COMPLETED/FAILURE"
          );
          expect(stdout).to.match(/.*TimeoutError*/);
          done();
        });
      });
    });

    after(function() {
      return clean(kubeconfigFile, "example-timeout");
    });
  });

  describe("when deploying to badimage cluster", function() {
    const kubeconfigFile =
      "/test/functional/clusters/configs/badimage-kubeconfig.yaml";
    describe("and deployment fails because of image pull errors", function() {
      it("should trigger a health check failure", function(done) {
        process.env.CONFIGS = kubeconfigFile;

        exec("./src/deployer", function(error, stdout) {
          expect(stdout).not.to.be.empty;
          expect(stdout).to.match(
            /Healthcheck detected \w+ error occurred \d+ times for badimage-deployment/
          );
          expect(stdout).to.match(
            /Healthcheck detected \w+ error exceeded threshold of \d+ for badimage-deployment/
          );
          expect(stdout).to.match(/Healthcheck grace period of \d+ms expired/);
          expect(stdout).to.contain("Stopping healthcheck watcher");
          expect(stdout).to.contain("Clearing healthcheck timeout");
          expect(stdout).to.match(/EventError: (.*?) for badimage-deployment-/);
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/badimage-deployment for badimage-deployment with status STARTED/IN_PROGRESS"
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/badimage-deployment for badimage-deployment with status COMPLETED/FAILURE"
          );
          done();
        });
      });
    });

    after(function() {
      return clean(kubeconfigFile, "badimage");
    });
  });

  describe("when deploying multiple deployments cluster", function() {
    const kubeconfigFile =
      "/test/functional/clusters/configs/multi-deployments-kubeconfig.yaml";
    describe("and multi-deployments cluster does not exist yet", function() {
      it("should deploy without error", function(done) {
        process.env.CONFIGS = kubeconfigFile;

        exec("./src/deployer", function(error, stdout, stderr) {
          expect(error).to.be.a("null", stdout);
          expect(stderr).to.be.empty;
          expect(stdout).not.to.be.empty;
          expect(stdout).to.contain("Generating tmp directory:");
          expect(stdout).to.contain(
            "multi-deployments-cluster - Strategy rolling-update"
          );
          expect(stdout).to.contain(
            "multi-deployments-cluster - Getting list of namespaces"
          );
          expect(stdout).to.contain(
            "multi-deployments-cluster - Apply multi-deployments namespace"
          );
          expect(stdout).to.contain(
            'multi-deployments-cluster - namespace "multi-deployments" created'
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status STARTED/IN_PROGRESS"
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/nginx2-deployment for nginx2-deployment with status STARTED/IN_PROGRESS"
          );
          expect(stdout).to.contain(
            "multi-deployments-cluster - Getting list of deployment,horizontalpodautoscaler matching 'app in (test)'"
          );
          expect(stdout).to.contain(
            "multi-deployments-cluster - Found 0 resources"
          );
          expect(stdout).to.contain(
            "multi-deployments-cluster - Running pre-deploy check to Apply nginx1-deployment"
          );
          expect(stdout).to.contain(
            "multi-deployments-cluster - Running pre-deploy check to Apply nginx2-deployment"
          );
          expect(stdout).to.contain(
            'multi-deployments-cluster - deployment "nginx1-deployment" created'
          );
          expect(stdout).to.contain(
            'multi-deployments-cluster - deployment "nginx2-deployment" created'
          );
          expect(stdout).to.contain(
            "multi-deployments-cluster - Deployment:nginx1-deployment is available"
          );
          expect(stdout).to.contain(
            "multi-deployments-cluster - Deployment:nginx2-deployment is available"
          );
          expect(stdout).to.contain(
            "multi-deployments-cluster - Deployment:nginx1-deployment has 1/1 replicas available"
          );
          expect(stdout).to.contain(
            "multi-deployments-cluster - Deployment:nginx2-deployment has 1/1 replicas available"
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status COMPLETED/SUCCESS"
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/nginx2-deployment for nginx2-deployment with status COMPLETED/SUCCESS"
          );
          expect(stdout).to.contain("Finished successfully");
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
          expect(stdout).to.contain(
            "multi-deployments-cluster - Strategy rolling-update"
          );
          expect(stdout).to.contain(
            "multi-deployments-cluster - Getting list of namespaces"
          );
          expect(stdout).not.to.contain(
            "multi-deployments-cluster - Apply multi-deployments namespace"
          );
          expect(stdout).not.to.contain(
            'multi-deployments-cluster - namespace "multi-deployments" created'
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status STARTED/IN_PROGRESS"
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/nginx2-deployment for nginx2-deployment with status STARTED/IN_PROGRESS"
          );
          expect(stdout).to.contain(
            "multi-deployments-cluster - Getting list of deployment,horizontalpodautoscaler matching 'app in (test)'"
          );
          expect(stdout).to.contain(
            "multi-deployments-cluster - Found 3 resources"
          );
          expect(stdout).to.contain(
            "multi-deployments-cluster - Running pre-deploy check to Apply nginx1-deployment"
          );
          expect(stdout).to.contain(
            "multi-deployments-cluster - Running pre-deploy check to Apply nginx2-deployment"
          );
          expect(stdout).not.to.contain(
            'multi-deployments-cluster - deployment "nginx1-deployment" created'
          );
          expect(stdout).not.to.contain(
            'multi-deployments-cluster - deployment "nginx2-deployment" created'
          );
          expect(stdout).to.contain(
            "multi-deployments-cluster - Deployment:nginx1-deployment is available"
          );
          expect(stdout).to.contain(
            "multi-deployments-cluster - Deployment:nginx2-deployment is available"
          );
          expect(stdout).to.contain(
            "multi-deployments-cluster - Deployment:nginx1-deployment has 1/1 replicas available"
          );
          expect(stdout).to.contain(
            "multi-deployments-cluster - Deployment:nginx2-deployment has 1/1 replicas available"
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status COMPLETED/SUCCESS"
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/nginx2-deployment for nginx2-deployment with status COMPLETED/SUCCESS"
          );
          expect(stdout).to.contain("Finished successfully");
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
    const kubeconfigFile =
      "/test/functional/clusters/configs/mix-deployment-service-kubeconfig.yaml";
    describe("and dryRun is enabled and mix-deployment-service cluster does not exist yet", function() {
      it("should deploy without error", function(done) {
        process.env.DRY_RUN = "true";
        process.env.CONFIGS = kubeconfigFile;

        exec("./src/deployer", function(error, stdout, stderr) {
          expect(error).to.be.a("null", stdout);
          expect(stderr).to.be.empty;
          expect(stdout).not.to.be.empty;
          expect(stdout).to.contain("Generating tmp directory:");
          expect(stdout).to.contain(clusterName + " - Strategy rolling-update");
          expect(stdout).to.contain(
            clusterName + " - Getting list of namespaces"
          );
          expect(stdout).to.contain(
            clusterName + " - Apply mix-deployment-service namespace"
          );
          expect(stdout).to.contain(
            clusterName +
              " - DryRun is enabled: skipping kubectl.apply(/test/functional/clusters/namespaces/mix-deployment-service-cluster/mix-deployment-service-namespace.yaml)"
          );
          expect(stdout).not.to.contain(
            clusterName + ' - namespace "mix-deployment-service" created'
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status STARTED/IN_PROGRESS"
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/auth-svc for auth-svc with status STARTED/IN_PROGRESS"
          );
          expect(stdout).to.contain(
            clusterName +
              " - Getting list of deployment,service matching 'app in (test)'"
          );
          expect(stdout).to.contain(clusterName + " - Found 0 resources");
          expect(stdout).to.contain(
            clusterName +
              " - Running pre-deploy check to Apply nginx1-deployment"
          );
          expect(stdout).to.contain(
            clusterName + " - Running pre-deploy check to Apply auth-svc"
          );
          expect(stdout).to.match(
            /.*mix-deployment-service-cluster - DryRun is enabled: skipping kubectl\.apply\(\/tmp\/kit-deployer\/9543ac65-223e-4746-939f-391231ec64bb_[0-9a-f-]{5,40}\/mix-deployment-service-cluster-nginx1-deployment\.yaml\.json\).*/
          );
          expect(stdout).to.contain(
            clusterName +
              " - DryRun is enabled: skipping available check for Deployment:nginx1-deployment"
          );
          expect(stdout).to.match(
            /.*mix-deployment-service-cluster - DryRun is enabled: skipping kubectl\.apply\(\/tmp\/kit-deployer\/9543ac65-223e-4746-939f-391231ec64bb_[0-9a-f-]{5,40}\/mix-deployment-service-cluster-auth-svc\.yaml\.json\).*/
          );
          expect(stdout).to.contain(
            clusterName +
              " - DryRun is enabled: skipping available check for Service:auth-svc"
          );
          expect(stdout).to.contain(
            clusterName +
              " - Strategy rolling-update DryRun is enabled: skipping cleanup"
          );
          expect(stdout).not.to.contain(
            clusterName + ' - deployment "nginx1-deployment" created'
          );
          expect(stdout).not.to.contain(
            clusterName + ' - service "auth-svc" created'
          );
          expect(stdout).not.to.contain(
            clusterName + " - Deployment:nginx1-deployment is available"
          );
          expect(stdout).not.to.contain(
            clusterName + " - Service:auth-svc is available"
          );
          expect(stdout).not.to.contain(
            clusterName +
              " - Deployment:nginx1-deployment has 1/1 replicas available"
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status COMPLETED/SUCCESS"
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/auth-svc for auth-svc with status COMPLETED/SUCCESS"
          );
          expect(stdout).to.contain(
            "This was a dry run and no changes were deployed"
          );
          expect(stdout).to.contain("Finished successfully");
          done();
        });
      });
    });

    describe("and mix-deployment-service cluster does not exist yet", function() {
      it("should deploy without error", function(done) {
        process.env.CONFIGS = kubeconfigFile;

        exec("./src/deployer", function(error, stdout, stderr) {
          expect(error).to.be.a("null", stdout);
          expect(stderr).to.be.empty;
          expect(stdout).not.to.be.empty;
          expect(stdout).to.contain("Generating tmp directory:");
          expect(stdout).to.contain(clusterName + " - Strategy rolling-update");
          expect(stdout).to.contain(
            clusterName + " - Getting list of namespaces"
          );
          expect(stdout).to.contain(
            clusterName + " - Apply mix-deployment-service namespace"
          );
          expect(stdout).to.contain(
            clusterName + ' - namespace "mix-deployment-service" created'
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status STARTED/IN_PROGRESS"
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/auth-svc for auth-svc with status STARTED/IN_PROGRESS"
          );
          expect(stdout).to.contain(
            clusterName +
              " - Getting list of deployment,service matching 'app in (test)'"
          );
          expect(stdout).to.contain(clusterName + " - Found 0 resources");
          expect(stdout).to.contain(
            clusterName +
              " - Running pre-deploy check to Apply nginx1-deployment"
          );
          expect(stdout).to.contain(
            clusterName + " - Running pre-deploy check to Apply auth-svc"
          );
          expect(stdout).to.contain(
            clusterName + ' - deployment "nginx1-deployment" created'
          );
          expect(stdout).to.contain(
            clusterName + ' - service "auth-svc" created'
          );
          expect(stdout).to.contain(
            clusterName + " - Deployment:nginx1-deployment is available"
          );
          expect(stdout).to.contain(
            clusterName + " - Service:auth-svc is available"
          );
          expect(stdout).to.contain(
            clusterName +
              " - Deployment:nginx1-deployment has 1/1 replicas available"
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status COMPLETED/SUCCESS"
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/auth-svc for auth-svc with status COMPLETED/SUCCESS"
          );
          expect(stdout).to.contain("Finished successfully");
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
          expect(stdout).to.contain(
            clusterName + " - Getting list of namespaces"
          );
          expect(stdout).not.to.contain(
            clusterName + " - Apply mix-deployment-service namespace"
          );
          expect(stdout).not.to.contain(
            clusterName + ' - namespace "mix-deployment-service" created'
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status STARTED/IN_PROGRESS"
          );
          // expect(stdout).to.contain("Sending payload to http://example.com/test/auth-svc for auth-svc with status STARTED/IN_PROGRESS");
          expect(stdout).to.contain(
            clusterName +
              " - Getting list of deployment,service matching 'app in (test)'"
          );
          expect(stdout).to.contain(clusterName + " - Found 2 resources");
          expect(stdout).to.contain(
            clusterName +
              " - Running pre-deploy check to Apply nginx1-deployment"
          );
          expect(stdout).to.contain(
            clusterName + " - Running pre-deploy check to Apply auth-svc"
          );
          expect(stdout).not.to.contain(
            clusterName + ' - deployment "nginx1-deployment" created'
          );
          expect(stdout).not.to.contain(
            clusterName + ' - service "auth-svc" created'
          );
          expect(stdout).to.contain(
            clusterName + " - Deployment:nginx1-deployment is available"
          );
          // expect(stdout).to.contain(clusterName + " - Service:auth-svc is available");
          expect(stdout).to.contain(
            clusterName +
              " - Deployment:nginx1-deployment has 1/1 replicas available"
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status COMPLETED/SUCCESS"
          );
          // expect(stdout).to.contain("Sending payload to http://example.com/test/auth-svc for auth-svc with status COMPLETED/SUCCESS");
          expect(stdout).to.contain("Finished successfully");
          done();
        });
      });
    });

    after(function() {
      return clean(kubeconfigFile, "mix-deployment-service");
    });
  });

  describe("when no unique namespaces and deploying to cluster", function() {
    it("should deploy without error", function(done) {
      process.env.CONFIGS =
        "/test/functional/clusters/configs/no-namespaces-kubeconfig.yaml";

      exec("./src/deployer", function(error, stdout, stderr) {
        expect(error).to.be.a("null", stdout);
        expect(stderr).to.be.empty;
        expect(stdout).not.to.be.empty;
        expect(stdout).not.to.contain("Generating tmp directory:");
        expect(stdout).to.contain(
          "no-namespaces-cluster - Strategy rolling-update"
        );
        expect(stdout).to.contain(
          "no-namespaces-cluster - No namespace files to processs, skipping no-namespaces-cluster"
        );
        expect(stdout).to.contain(
          "no-namespaces-cluster - No cluster files to processs, skipping no-namespaces-cluster"
        );
        expect(stdout).to.contain(
          "no-namespaces-cluster - Strategy rolling-update deployed 0 services after all deployments available"
        );
        expect(stdout).to.contain("Finished successfully");
        done();
      });
    });
  });

  describe("when deploying a single job to a cluster", function() {
    const kubeconfigFile =
      "/test/functional/clusters/configs/single-job-kubeconfig.yaml";
    it("should deploy without error", function(done) {
      process.env.CONFIGS = kubeconfigFile;

      exec("./src/deployer", function(error, stdout, stderr) {
        expect(error).to.be.a("null", stdout);
        expect(stderr).to.be.empty;
        expect(stdout).not.to.be.empty;
        expect(stdout).to.contain("Generating tmp directory:");
        expect(stdout).to.contain(
          "single-job-cluster - Strategy rolling-update"
        );
        expect(stdout).to.contain(
          "single-job-cluster - Getting list of namespaces"
        );
        expect(stdout).to.contain(
          "Sending payload to http://example.com/test/ls-job for ls-job with status STARTED/IN_PROGRESS"
        );
        expect(stdout).to.contain(
          "single-job-cluster - Getting list of job matching 'app in (test)'"
        );
        expect(stdout).to.contain(
          "single-job-cluster - Apply single-job namespace"
        );
        expect(stdout).to.contain(
          'single-job-cluster - namespace "single-job" created'
        );
        expect(stdout).to.contain("single-job-cluster - Found 0 resources");
        expect(stdout).to.contain(
          "single-job-cluster - Running pre-deploy check to Apply ls-job"
        );
        expect(stdout).to.match(
          /.*single-job-cluster - job "ls-job-\b[0-9a-f]{5,40}\b" created*/
        );
        expect(stdout).to.match(
          /.*single-job-cluster - Job:ls-job-\b[0-9a-f]{5,40}\b is available.*/
        );
        expect(stdout).to.match(
          /.*single-job-cluster - Job:ls-job-\b[0-9a-f]{5,40}\b has 1\/1 succeeded.*/
        );
        expect(stdout).to.contain(
          "Sending payload to http://example.com/test/ls-job for ls-job with status COMPLETED/SUCCESS"
        );
        expect(stdout).to.contain("Finished successfully");
        done();
      });
    });

    after(function() {
      return clean(kubeconfigFile, "single-job");
    });
  });

  afterEach(function() {
    delete process.env.UUID;
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
    delete process.env.BACKOFF_FAIL_AFTER;
    delete process.env.BACKOFF_INITIAL_DELAY;
    delete process.env.BACKOFF_MAX_DELAY;
    delete process.env.AVAILABLE_ENABLED;
    delete process.env.AVAILABLE_ALL;
    delete process.env.AVAILABLE_TIMEOUT;
    delete process.env.AVAILABLE_REQUIRED;
    delete process.env.AVAILABLE_KEEP_ALIVE;
    delete process.env.AVAILABLE_WEB;
    delete process.env.STRATEGY;
    delete process.env.DEPLOY_ID;
    delete process.env.CREATE_ONLY;
  });
});
