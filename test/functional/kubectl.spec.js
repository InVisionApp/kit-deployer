"use strict";

const sinon = require("sinon");
const sinonChai = require("sinon-chai");
const chai = require("chai");
chai.should();
chai.use(sinonChai);
const expect = chai.expect;
const Kubectl = require("../../src/lib/kubectl");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const Promise = require("bluebird");
const readFileAsync = Promise.promisify(fs.readFile);

function clean(kubeconfigFile, namespace) {
  const cwd = path.dirname(kubeconfigFile);
  const kubectl = new Kubectl({
    backoff: {
      failAfter: 1,
      initialDelay: 100,
      maxDelay: 500
    },
    cwd: cwd,
    kubeconfig: yaml.safeLoad(fs.readFileSync(kubeconfigFile, "utf8")),
    kubeconfigFile: kubeconfigFile
  });
  return kubectl.deleteByName("namespace", namespace);
}

describe("Kubectl", function() {
  this.timeout(10000);

  describe("when deploying to example cluster", function() {
    const kubeconfigFile =
      "/test/functional/clusters/configs/example-kubeconfig.yaml";
    const namespaceFile =
      "/test/functional/clusters/namespaces/example-cluster/example-namespace.yaml";
    let kubectl, warnSpy;
    beforeEach(() => {
      warnSpy = sinon.spy();
      return readFileAsync(kubeconfigFile, "utf8").then(rawContent => {
        // Parse the cluster yaml file to JSON
        let config = yaml.safeLoad(rawContent);
        kubectl = new Kubectl({
          backoff: {
            failAfter: 1,
            initialDelay: 100,
            maxDelay: 500
          },
          cwd: path.dirname(kubeconfigFile),
          kubeconfig: config,
          kubeconfigFile: kubeconfigFile
        });
        kubectl.on("warn", warnSpy);
        return kubectl.apply(namespaceFile);
      });
    });
    describe("and deleting a resource by name that doesn't exist", function() {
      it("should not throw an error", function() {
        return kubectl
          .deleteByName("deployment", "does-not-exist-deployment")
          .then(() => {
            expect(warnSpy).to.have.been.calledOnce;
            expect(warnSpy).to.have.been.calledWith(
              `Attempting to delete deployment:does-not-exist-deployment which does not exist on the server`
            );
          });
      });
    });
    describe("and deleting a resource by file that doesn't exist", function() {
      it("should not throw an error", function() {
        return kubectl
          .delete(
            "/test/functional/clusters/manifests/example-cluster/auth-svc.yaml"
          )
          .then(() => {
            expect(warnSpy).to.have.been.calledOnce;
            expect(warnSpy).to.have.been.calledWith(
              `Attempting to delete /test/functional/clusters/manifests/example-cluster/auth-svc.yaml which does not exist on the server`
            );
          });
      });
    });
    describe("and deploying file that doesn't exist", function() {
      it("should throw an error", function() {
        return kubectl
          .delete(
            "/test/functional/clusters/manifests/example-cluster/does-not-exist-file-svc.yaml"
          )
          .catch(err => {
            expect(err).to.be.defined;
          });
      });
    });

    after(function() {
      return clean(kubeconfigFile, "example");
    });
  });
});
