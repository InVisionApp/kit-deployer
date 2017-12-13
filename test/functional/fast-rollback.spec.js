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

describe("Functional fast-rollback", function() {
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
    process.env.RAW = "false";
  });

  describe("when deploying deployment and service cluster using fast-rollback strategy", function() {
    const firstKubeconfigFile =
      "/test/functional/clusters/configs/fast-rollback-kubeconfig-0.yaml";
    describe("and fast-rollback-service cluster manually deployed without strategy", function() {
      it("should deploy without error", function(done) {
        process.env.CONFIGS = firstKubeconfigFile;
        delete process.env.DEPLOY_ID;

        exec(
          `./bin/kubectl --kubeconfig=.${firstKubeconfigFile} create -f ./test/functional/clusters/namespaces/fast-rollback-cluster-0/fast-rollback-namespace.yaml`,
          function(error, stdout, stderr) {
            expect(error).to.be.a("null", stdout);
            expect(stderr).to.be.empty;
            expect(stdout).not.to.be.empty;
            expect(stdout).to.contain(`namespace "fast-rollback" created`);
            exec(
              `./bin/kubectl --kubeconfig=.${firstKubeconfigFile} create -f ./test/functional/clusters/manifests/fast-rollback-cluster-0`,
              function(error, stdout, stderr) {
                expect(error).to.be.a("null", stdout);
                expect(stderr).to.be.empty;
                expect(stdout).not.to.be.empty;
                expect(stdout).to.contain(
                  `deployment "nginx1-deployment" created`
                );
                expect(stdout).to.contain(`service "nginx1-svc" created`);
                done();
              }
            );
          }
        );
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
          expect(stdout).to.contain(
            "Warning: kubectl apply should be used on resource created by either kubectl create --save-config or kubectl apply"
          );
          expect(stdout).to.contain(
            clusterName + " - Getting list of namespaces"
          );
          expect(stdout).not.to.contain(
            clusterName + " - Apply fast-rollback namespace"
          );
          expect(stdout).to.contain(
            clusterName + ` - deployment "nginx1-deployment" configured`
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status STARTED/IN_PROGRESS"
          );
          // expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-svc for nginx1-svc with status STARTED/IN_PROGRESS");
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
            clusterName + " - Running pre-deploy check to Apply nginx1-svc"
          );
          expect(stdout).to.contain(
            clusterName + ' - deployment "nginx1-deployment" configured'
          );
          expect(stdout).to.contain(
            clusterName +
              " - Strategy rolling-update waiting for all deployments to be available before deploying service nginx1-svc"
          );
          expect(stdout).to.contain(
            clusterName + " - Deployment:nginx1-deployment is available"
          );
          // expect(stdout).to.contain(clusterName + " - Service:nginx1-svc is available");
          expect(stdout).to.contain(
            clusterName +
              " - Deployment:nginx1-deployment has 1/1 replicas available"
          );
          expect(stdout).to.contain(
            clusterName +
              " - Strategy rolling-update all 2 manifests are available"
          );
          expect(stdout).to.contain(
            clusterName +
              " - Strategy rolling-update successfully deployed nginx1-svc service after all deployments were available"
          );
          expect(stdout).to.contain(
            clusterName +
              " - Strategy rolling-update deployed 1 services after all deployments available"
          );
          expect(stdout).to.contain(
            clusterName +
              " - Strategy rolling-update cleanup attempting to delete 0 deployments that match the nginx1-deployment deployment group label name=nginx1-pod,strategy!=rolling-update"
          );
          // TODO: expect(stdout).to.contain(clusterName + " - Strategy rolling-update cleanup attempting to delete 1 replicasets that match the nginx1-deployment deployment group label name=nginx1-pod,strategy!=rolling-update");
          // TODO: expect(stdout).to.contain(clusterName + " - Strategy rolling-update cleanup deleted replicaset nginx1-deployment-");
          // TODO: expect(stdout).to.contain(clusterName + " - Strategy rolling-update cleanup successfully deleted 1 replicasets");
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status COMPLETED/SUCCESS"
          );
          // expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-svc for nginx1-svc with status COMPLETED/SUCCESS");
          expect(stdout).to.contain("Finished successfully");
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
          expect(stdout).to.contain(
            clusterName + " - Getting list of namespaces"
          );
          expect(stdout).not.to.contain(
            clusterName + " - Apply fast-rollback namespace"
          );
          expect(stdout).not.to.contain(
            clusterName + ' - namespace "fast-rollback" created'
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status STARTED/IN_PROGRESS"
          );
          // expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-svc for nginx1-svc with status STARTED/IN_PROGRESS");
          expect(stdout).to.contain(
            clusterName +
              " - Getting list of deployment,service matching 'app in (test)'"
          );
          expect(stdout).to.contain(clusterName + " - Found 2 resources");
          expect(stdout).to.contain(
            clusterName +
              " - Running pre-deploy check to Apply nginx1-deployment-unspecified"
          );
          expect(stdout).to.contain(
            clusterName +
              ' - deployment "nginx1-deployment-unspecified" created'
          );
          expect(stdout).to.contain(
            clusterName +
              " - Strategy fast-rollback waiting for all deployments to be available before deploying service nginx1-svc"
          );
          expect(stdout).to.contain(
            clusterName +
              " - Deployment:nginx1-deployment-unspecified is available"
          );
          // expect(stdout).to.contain(clusterName + " - Service:nginx1-svc is available");
          expect(stdout).to.contain(
            clusterName +
              " - Deployment:nginx1-deployment-unspecified has 1/1 replicas available"
          );
          expect(stdout).to.contain(
            clusterName +
              " - Strategy fast-rollback all 2 manifests are available"
          );
          expect(stdout).to.contain(
            clusterName +
              " - Strategy fast-rollback verified 1 pods match the service selector name=nginx1-pod,strategy=fast-rollback,id=unspecified"
          );
          expect(stdout).to.contain(
            clusterName +
              " - Strategy fast-rollback successfully deployed nginx1-svc service after all deployments were available"
          );
          expect(stdout).to.contain(
            clusterName +
              " - Strategy fast-rollback deployed 1 services after all deployments available"
          );
          expect(stdout).to.contain(
            clusterName +
              " - Strategy fast-rollback deleteNewer found 0 deployments that match the nginx1-deployment-unspecified deployment group label name=nginx1-pod,id!=unspecified,strategy=fast-rollback"
          );
          expect(stdout).to.contain(
            clusterName +
              " - Strategy fast-rollback attempting to delete 0 deployments newer than nginx1-deployment-unspecified"
          );
          expect(stdout).to.contain(
            clusterName +
              " - Strategy fast-rollback deleteBackups found 0 backup deployments on reserve that match the nginx1-deployment-unspecified deployment group label name=nginx1-pod,id!=unspecified,strategy=fast-rollback"
          );
          expect(stdout).to.contain(
            clusterName +
              " - Strategy fast-rollback skipping delete of older deployments because insufficent backup deployments on reserve"
          );
          expect(stdout).to.contain(
            clusterName +
              " - Strategy fast-rollback cleanup attempting to delete 1 deployments that match the nginx1-deployment-unspecified deployment group label name=nginx1-pod,strategy!=fast-rollback"
          );
          expect(stdout).to.contain(
            clusterName +
              " - Strategy fast-rollback cleanup deleted deployment nginx1-deployment"
          );
          expect(stdout).to.contain(
            clusterName +
              " - Strategy fast-rollback cleanup successfully deleted 1 deployments"
          );
          expect(stdout).to.contain(
            clusterName +
              " - Strategy fast-rollback cleanup attempting to delete 0 replicasets that match the nginx1-deployment-unspecified deployment group label name=nginx1-pod,strategy!=fast-rollback"
          );
          expect(stdout).to.contain(
            "Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status COMPLETED/SUCCESS"
          );
          // expect(stdout).to.contain("Sending payload to http://example.com/test/nginx1-svc for nginx1-svc with status COMPLETED/SUCCESS");
          expect(stdout).to.contain("Finished successfully");
          done();
        });
      });
    });

    const deployIds = ["dep-1", "dep-2", "dep-3", "dep-4", "dep-5"];
    _.each(deployIds, (id, index) => {
      var clusterName = "fast-rollback-cluster-" + (index + 1);
      var kubeconfigFile =
        "/test/functional/clusters/configs/fast-rollback-kubeconfig-" +
        (index + 1) +
        ".yaml";
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
            expect(stdout).to.contain(
              clusterName + " - Strategy fast-rollback"
            );
            expect(stdout).to.contain(
              clusterName + " - Getting list of namespaces"
            );
            expect(stdout).not.to.contain(
              clusterName + " - Apply fast-rollback namespace"
            );
            expect(stdout).not.to.contain(
              clusterName + ' - namespace "fast-rollback" created'
            );
            expect(stdout).to.contain(
              "Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status STARTED/IN_PROGRESS"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Getting list of deployment,service matching 'app in (test)'"
            );
            expect(stdout).to.contain(
              clusterName + " - Strategy fast-rollback annotating nginx1-svc"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback annotating nginx1-deployment"
            );
            expect(stdout).to.contain(
              clusterName + " - Differences for nginx1-svc"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Running pre-deploy check to Apply nginx1-deployment-" +
                process.env.DEPLOY_ID
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback waiting for all deployments to be available before deploying service nginx1-svc"
            );
            expect(stdout).to.contain(
              clusterName + " - Running pre-deploy check to Apply nginx1-svc"
            );
            expect(stdout).to.contain(
              clusterName +
                ' - deployment "nginx1-deployment-' +
                process.env.DEPLOY_ID +
                '" created'
            );
            expect(stdout).to.contain(
              clusterName +
                " - Deployment:nginx1-deployment-" +
                process.env.DEPLOY_ID +
                " is available"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback all 2 manifests are available"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback verified 1 pods match the service selector name=nginx1-pod,strategy=fast-rollback,id=" +
                id
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback successfully deployed nginx1-svc service after all deployments were available"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback deployed 1 services after all deployments available"
            );
            if (index < 3) {
              expect(stdout).to.contain(
                clusterName +
                  " - Strategy fast-rollback deleteNewer found " +
                  (index + 1) +
                  " deployments that match the nginx1-deployment-dep-" +
                  (index + 1) +
                  " deployment group label name=nginx1-pod,id!=" +
                  id +
                  ",strategy=fast-rollback"
              );
              expect(stdout).to.contain(
                clusterName +
                  " - Strategy fast-rollback attempting to delete 0 deployments newer than nginx1-deployment-dep-" +
                  (index + 1)
              );
              expect(stdout).to.contain(
                clusterName +
                  " - Strategy fast-rollback deleteBackups found " +
                  (index + 1) +
                  " backup deployments on reserve that match the nginx1-deployment-dep-" +
                  (index + 1) +
                  " deployment group label name=nginx1-pod,id!=" +
                  id +
                  ",strategy=fast-rollback"
              );
              expect(stdout).to.contain(
                clusterName + " - Found " + (index + 2) + " resources"
              );
              expect(stdout).to.contain(
                clusterName +
                  " - Strategy fast-rollback skipping delete of older deployments because insufficent backup deployments on reserve"
              );
            } else {
              // expect(stdout).to.contain(clusterName + " - Found 5 resources");
              expect(stdout).to.contain(
                clusterName +
                  " - Strategy fast-rollback deleteNewer found 4 deployments that match the nginx1-deployment-dep-" +
                  (index + 1) +
                  " deployment group label name=nginx1-pod,id!=" +
                  id +
                  ",strategy=fast-rollback"
              );
              expect(stdout).to.contain(
                clusterName +
                  " - Strategy fast-rollback attempting to delete 0 deployments newer than nginx1-deployment-dep-" +
                  (index + 1)
              );
              expect(stdout).to.contain(
                clusterName +
                  " - Strategy fast-rollback deleteBackups found 4 backup deployments on reserve that match the nginx1-deployment-dep-" +
                  (index + 1) +
                  " deployment group label name=nginx1-pod,id!=" +
                  id +
                  ",strategy=fast-rollback"
              );
              expect(stdout).to.contain(
                clusterName +
                  " - Strategy fast-rollback attempting to delete 1 deployments older than nginx1-deployment-dep-" +
                  (index + 1)
              );
              if (index == 3) {
                expect(stdout).to.contain(
                  clusterName +
                    " - Strategy fast-rollback deleted backup deployment nginx1-deployment"
                );
              } else {
                expect(stdout).to.contain(
                  clusterName +
                    " - Strategy fast-rollback deleted backup deployment nginx1-deployment-dep-" +
                    (index - 3)
                );
              }
              expect(stdout).to.contain(
                clusterName +
                  " - Strategy fast-rollback successfully deleted 1 deployments older than nginx1-deployment-dep-" +
                  (index + 1)
              );
            }
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback cleanup attempting to delete 0 deployments that match the nginx1-deployment-dep-" +
                (index + 1) +
                " deployment group label name=nginx1-pod,strategy!=fast-rollback"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback cleanup attempting to delete 0 replicasets that match the nginx1-deployment-dep-" +
                (index + 1) +
                " deployment group label name=nginx1-pod,strategy!=fast-rollback"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Deployment:nginx1-deployment-" +
                process.env.DEPLOY_ID +
                " has 1/1 replicas available"
            );
            expect(stdout).to.contain(
              "Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status COMPLETED/SUCCESS"
            );
            expect(stdout).to.contain("Finished successfully");
            done();
          });
        });
      });
    });

    describe("and rolling back fast-rollback-service cluster to a reserve backup", function() {
      var clusterName = "fast-rollback-cluster-3";
      var kubeconfigFile =
        "/test/functional/clusters/configs/fast-rollback-kubeconfig-3.yaml";
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
            expect(stdout).to.contain(
              clusterName + " - Strategy fast-rollback"
            );
            expect(stdout).to.contain(
              clusterName + " - Getting list of namespaces"
            );
            expect(stdout).not.to.contain(
              clusterName + " - Apply fast-rollback namespace"
            );
            expect(stdout).not.to.contain(
              clusterName + ' - namespace "fast-rollback" created'
            );
            expect(stdout).to.contain(
              "Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status STARTED/IN_PROGRESS"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Getting list of deployment,service matching 'app in (test)'"
            );
            expect(stdout).to.contain(clusterName + " - Found 5 resources");
            expect(stdout).to.contain(
              clusterName + " - Strategy fast-rollback annotating nginx1-svc"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback annotating nginx1-deployment"
            );
            expect(stdout).to.contain(
              clusterName + " - Differences for nginx1-svc"
            );
            expect(stdout).not.to.contain(
              clusterName +
                " - Running pre-deploy check to Apply nginx1-deployment-" +
                process.env.DEPLOY_ID
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback deployment nginx1-deployment-" +
                id +
                " already exists in the cluster so skipping"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback waiting for all deployments to be available before deploying service nginx1-svc"
            );
            expect(stdout).to.contain(
              clusterName + " - Running pre-deploy check to Apply nginx1-svc"
            );
            expect(stdout).not.to.contain(
              clusterName +
                ' - deployment "nginx1-deployment-' +
                process.env.DEPLOY_ID +
                '" created'
            );
            expect(stdout).to.contain(
              clusterName +
                " - Deployment:nginx1-deployment-" +
                process.env.DEPLOY_ID +
                " is available"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback all 2 manifests are available"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback verified 1 pods match the service selector name=nginx1-pod,strategy=fast-rollback,id=" +
                id
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback successfully deployed nginx1-svc service after all deployments were available"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback deployed 1 services after all deployments available"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback deleteNewer found 3 deployments that match the nginx1-deployment-dep-3 deployment group label name=nginx1-pod,id!=dep-3,strategy=fast-rollback"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback attempting to delete 2 deployments newer than nginx1-deployment-dep-3"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback deleted newer deployment nginx1-deployment-dep-4"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback deleted newer deployment nginx1-deployment-dep-5"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback successfully deleted 2 deployments newer than nginx1-deployment-dep-3"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback deleteBackups found 1 backup deployments on reserve that match the nginx1-deployment-dep-3 deployment group label name=nginx1-pod,id!=dep-3,strategy=fast-rollback"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback skipping delete of older deployments because insufficent backup deployments on reserve"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback cleanup attempting to delete 0 deployments that match the nginx1-deployment-dep-3 deployment group label name=nginx1-pod,strategy!=fast-rollback"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback cleanup attempting to delete 0 replicasets that match the nginx1-deployment-dep-3 deployment group label name=nginx1-pod,strategy!=fast-rollback"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Deployment:nginx1-deployment-" +
                process.env.DEPLOY_ID +
                " has 1/1 replicas available"
            );
            expect(stdout).to.contain(
              "Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status COMPLETED/SUCCESS"
            );
            expect(stdout).to.contain("Finished successfully");
            done();
          });
        });
      });
    });

    describe("and rolling back fast-rollback-service cluster to a reserve backup using raw", function() {
      var clusterName = "fast-rollback-raw-cluster";
      var kubeconfigFile =
        "/test/functional/clusters/configs/fast-rollback-raw-kubeconfig.yaml";
      var id = "dep-2";
      describe("to deployId=" + id, function() {
        it("should deploy without error", function(done) {
          process.env.CONFIGS = kubeconfigFile;
          process.env.STRATEGY = "fast-rollback";
          process.env.DEPLOY_ID = id;
          process.env.IS_ROLLBACK = "true";
          process.env.RAW = "true";

          exec("./src/deployer", function(error, stdout, stderr) {
            expect(error).to.be.a("null", stdout);
            expect(stderr).to.be.empty;
            expect(stdout).not.to.be.empty;
            expect(stdout).to.contain("Generating tmp directory:");
            expect(stdout).to.contain(
              clusterName + " - Strategy fast-rollback"
            );
            expect(stdout).to.contain(
              clusterName + " - Getting list of namespaces"
            );
            expect(stdout).not.to.contain(
              clusterName + " - Apply fast-rollback namespace"
            );
            expect(stdout).not.to.contain(
              clusterName + ' - namespace "fast-rollback" created'
            );
            expect(stdout).to.contain(
              "Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status STARTED/IN_PROGRESS"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Getting list of deployment,service matching 'app in (test)'"
            );
            expect(stdout).to.contain(clusterName + " - Found 3 resources");
            expect(stdout).not.to.contain(
              clusterName + " - Strategy fast-rollback annotating nginx1-svc"
            );
            expect(stdout).not.to.contain(
              clusterName +
                " - Strategy fast-rollback annotating nginx1-deployment"
            );
            expect(stdout).to.contain(
              clusterName + " - Differences for nginx1-svc"
            );
            expect(stdout).not.to.contain(
              clusterName +
                " - Running pre-deploy check to Apply nginx1-deployment-" +
                process.env.DEPLOY_ID
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback deployment nginx1-deployment-" +
                id +
                " already exists in the cluster so skipping"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback waiting for all deployments to be available before deploying service nginx1-svc"
            );
            expect(stdout).to.contain(
              clusterName + " - Running pre-deploy check to Apply nginx1-svc"
            );
            expect(stdout).not.to.contain(
              clusterName +
                ' - deployment "nginx1-deployment-' +
                process.env.DEPLOY_ID +
                '" created'
            );
            expect(stdout).to.contain(
              clusterName +
                " - Deployment:nginx1-deployment-" +
                process.env.DEPLOY_ID +
                " is available"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback all 2 manifests are available"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback verified 1 pods match the service selector name=nginx1-pod,strategy=fast-rollback,id=" +
                id
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback successfully deployed nginx1-svc service after all deployments were available"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback deployed 1 services after all deployments available"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback deleteNewer found 1 deployments that match the nginx1-deployment-dep-2 deployment group label name=nginx1-pod,id!=dep-2,strategy=fast-rollback"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback attempting to delete 1 deployments newer than nginx1-deployment-dep-2"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback deleted newer deployment nginx1-deployment-dep-3"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback successfully deleted 1 deployments newer than nginx1-deployment-dep-2"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback deleteBackups found 0 backup deployments on reserve that match the nginx1-deployment-dep-2 deployment group label name=nginx1-pod,id!=dep-2,strategy=fast-rollback"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback skipping delete of older deployments because insufficent backup deployments on reserve"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback cleanup attempting to delete 0 deployments that match the nginx1-deployment-dep-2 deployment group label name=nginx1-pod,strategy!=fast-rollback"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy fast-rollback cleanup attempting to delete 0 replicasets that match the nginx1-deployment-dep-2 deployment group label name=nginx1-pod,strategy!=fast-rollback"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Deployment:nginx1-deployment-" +
                process.env.DEPLOY_ID +
                " has 1/1 replicas available"
            );
            expect(stdout).to.contain(
              "Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status COMPLETED/SUCCESS"
            );
            expect(stdout).to.contain("Finished successfully");
            done();
          });
        });
      });
    });

    describe("and switching back to rolling-update", function() {
      var clusterName = "fast-rollback-cluster-0";
      var kubeconfigFile =
        "/test/functional/clusters/configs/fast-rollback-kubeconfig-0.yaml";
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
            expect(stdout).to.contain(
              clusterName + " - Strategy rolling-update"
            );
            expect(stdout).to.contain(
              clusterName + " - Getting list of namespaces"
            );
            expect(stdout).not.to.contain(
              clusterName + " - Apply fast-rollback namespace"
            );
            expect(stdout).not.to.contain(
              clusterName + ' - namespace "fast-rollback" created'
            );
            expect(stdout).to.contain(
              "Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status STARTED/IN_PROGRESS"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Getting list of deployment,service matching 'app in (test)'"
            );
            expect(stdout).to.contain(clusterName + " - Found 2 resources");
            expect(stdout).to.contain(
              clusterName + " - Strategy rolling-update annotating nginx1-svc"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy rolling-update annotating nginx1-deployment"
            );
            expect(stdout).to.contain(
              clusterName + " - Differences for nginx1-svc"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Running pre-deploy check to Apply nginx1-deployment"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy rolling-update waiting for all deployments to be available before deploying service nginx1-svc"
            );
            expect(stdout).to.contain(
              clusterName + " - Running pre-deploy check to Apply nginx1-svc"
            );
            expect(stdout).to.contain(
              clusterName + ' - deployment "nginx1-deployment" created'
            );
            expect(stdout).to.contain(
              clusterName +
                " - Deployment:nginx1-deployment has 1/1 replicas available"
            );
            expect(stdout).to.contain(
              clusterName + " - Deployment:nginx1-deployment is available"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy rolling-update all 2 manifests are available"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy rolling-update successfully deployed nginx1-svc service after all deployments were available"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy rolling-update deployed 1 services after all deployments available"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy rolling-update cleanup attempting to delete 1 deployments that match the nginx1-deployment deployment group label name=nginx1-pod,strategy!=rolling-update"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy rolling-update cleanup deleted deployment nginx1-deployment-dep-2"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy rolling-update cleanup successfully deleted 1 deployments"
            );
            expect(stdout).to.contain(
              clusterName +
                " - Strategy rolling-update cleanup attempting to delete 0 replicasets that match the nginx1-deployment deployment group label name=nginx1-pod,strategy!=rolling-update"
            );
            expect(stdout).to.contain(
              "Sending payload to http://example.com/test/nginx1-deployment for nginx1-deployment with status COMPLETED/SUCCESS"
            );
            expect(stdout).to.contain("Finished successfully");
            done();
          });
        });
      });
    });
    after(function() {
      return clean(firstKubeconfigFile, "fast-rollback");
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
    delete process.env.RAW;
  });
});
