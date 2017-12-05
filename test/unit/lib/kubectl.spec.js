"use strict";

const _ = require("lodash");
const chai = require("chai");
const expect = chai.expect;
const Kubectl = require("../../../src/lib/kubectl");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

let supportedTypes = [
  "deployment",
  "ingress",
  "service",
  "secret",
  "job",
  "scheduledjob",
  "cronjob",
  "daemonset",
  "persistentvolumeclaim",
  "events"
];

describe("Kubectl", () => {
  var kubectl, cwd;
  beforeEach(() => {
    cwd = path.join(__dirname, "kubectl");
    const kubeconfigFile = path.join(cwd, "example-kubeconfig.yaml");
    const rawKubeconfig = fs.readFileSync(kubeconfigFile, "utf8");
    const kubeconfig = yaml.safeLoad(rawKubeconfig);
    kubectl = new Kubectl({
      backoff: {
        failAfter: 3,
        initialDelay: 50,
        maxDelay: 100
      },
      cwd: cwd,
      kubeconfig: kubeconfig,
      kubeconfigFile: kubeconfigFile
    });
  });

  describe("Constructor", () => {
    it("should construct without error", () => {
      expect(kubectl).to.exist;
    });
  });

  describe("Get", () => {
    var requests = [];
    var spawns = [];
    it("should have supportedTypes to test", () => {
      expect(supportedTypes.length).to.be.greaterThan(0);
    });
    _.each(supportedTypes, resource => {
      it("should emit request get event for " + resource, done => {
        let backoffCount = 0;
        let requestAttempts = 0;
        let spawnAttempts = 0;
        kubectl.on("backoff", args => {
          backoffCount++;
          expect(args.method).to.equal("get");
          expect(args.name).to.equal("resource-name");
          expect(args.resource).to.equal(resource);
        });
        kubectl.on("request", args => {
          requestAttempts++;
          expect(args.method).to.equal("get");
          expect(args.resource).to.equal(resource);
          expect(args.name).to.equal("resource-name");
          if (requestAttempts > kubectl.backoff.failAfter) {
            requests.push(resource);
          }
        });
        // The ones that aren't supported will fallback to using spawn (kubectl binary)
        kubectl.on("spawn", args => {
          expect(args[0]).to.equal("get");
          if (spawnAttempts > kubectl.backoff.failAfter) {
            spawns.push(resource);
          }
        });
        kubectl.get(resource, "resource-name").catch(() => {
          expect(backoffCount).to.equal(kubectl.backoff.failAfter);
          done();
        });
      });
      it("should only error on address " + resource, done => {
        kubectl.get(resource, "resource-name").catch(err => {
          expect(err.message).to.contain("127.0.0.1:8080");
          done();
        });
      });
    });
    it("should have the expected number of spawns", () => {
      expect(spawns).to.deep.equal([]);
    });
    it("should have the expected number of requests", () => {
      expect(requests).to.deep.equal([
        "deployment",
        "ingress",
        "service",
        "secret",
        "job",
        "scheduledjob",
        "cronjob",
        "daemonset",
        "persistentvolumeclaim",
        "events"
      ]);
    });
  });

  describe("Create", () => {
    it("should emit spawn create event", done => {
      let backoffCount = 0;
      let spawnCalled = false;
      kubectl.on("backoff", args => {
        backoffCount++;
        expect(args.method).to.equal("create");
        expect(args.name).to.be.null;
        expect(args.resource).to.be.null;
      });
      kubectl.on("spawn", args => {
        expect(args[0]).to.equal("create");
        spawnCalled = true;
      });
      kubectl.create(path.join(cwd, "example-namespace.yaml")).catch(() => {
        expect(spawnCalled).to.be.true;
        expect(backoffCount).to.equal(kubectl.backoff.failAfter);
        done();
      });
    });
  });
  describe("Spawn", () => {
    it("should emit spawn event", done => {
      let backoffCount = 0;
      let spawnCalled = false;
      kubectl.on("backoff", args => {
        backoffCount++;
        expect(args.method).to.equal("help");
        expect(args.name).to.be.null;
        expect(args.resource).to.be.null;
      });
      kubectl.on("spawn", args => {
        expect(args[0]).to.equal("help");
        spawnCalled = true;
      });
      kubectl.spawn(["help"], () => {
        expect(spawnCalled).to.be.true;
        expect(backoffCount).to.equal(0);
        done();
      });
    });
    it("should run without error", done => {
      kubectl.spawn(["help"], done);
    });
  });
});
