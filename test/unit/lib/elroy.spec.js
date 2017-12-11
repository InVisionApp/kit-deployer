"use strict";

const chai = require("chai");
const Promise = require("bluebird");
const expect = chai.expect;
const Elroy = require("../../../src/lib/elroy").Elroy;
const Status = require("../../../src/lib/elroy").Status;
const Type = require("../../../src/lib/elroy").Type;

describe("Elroy", () => {
  let uuid,
    clusterName,
    resource,
    manifests,
    isRollback,
    error,
    success,
    calledWith;
  const yamlManifests = [
    `metadata:
  name: service-name
`
  ];
  const requestMock = function(opt) {
    calledWith = opt;
    return new Promise((resolve, reject) => {
      if (success == true) {
        resolve({ success: true });
      } else {
        reject(new Error("Example error"));
      }
    });
  };

  function reset() {
    uuid = "f88e3aea-60e5-4832-a8b3-d158034224d3";
    clusterName = "sample-cluster";
    resource = "resource-name";
    manifests = [
      {
        metadata: {
          name: "service-name"
        }
      }
    ];
    isRollback = false;
    error = null;
    success = false;
    calledWith = undefined;
  }

  describe("Enabled and success", () => {
    before(() => {
      reset();
    });
    after(() => {
      reset();
    });
    it("should call request correctly", () => {
      success = true;
      const elroy = new Elroy({
        uuid: uuid,
        url: "https://elroy.example.com",
        secret: "xxxxxx",
        enabled: true,
        isRollback: isRollback,
        clusterName: clusterName,
        resource: resource
      });
      elroy.request = requestMock;
      return elroy.start(manifests).then(data => {
        expect(data).to.exist;
        expect(calledWith.method).to.equal("PUT");
        expect(calledWith.uri).to.equal(
          "https://elroy.example.com/api/v1/deploy"
        );
        expect(calledWith.body).to.deep.equal({
          uuid: uuid,
          deploymentEnvironment: clusterName,
          service: resource,
          type: Type.Promotion,
          status: Status.InProgress,
          manifests: yamlManifests
        });
      });
    });
  });
  describe("Not Enabled", () => {
    it("should not save and resolve empty promise", () => {
      success = true;
      const elroy = new Elroy({
        uuid: uuid,
        url: "https://elroy.example.com",
        secret: "xxxxxx",
        enabled: false,
        isRollback: isRollback,
        clusterName: clusterName,
        resource: resource
      });
      elroy.request = requestMock;
      return elroy.start(manifests).then(data => {
        expect(data).to.not.exist;
      });
    });
  });
  describe("Enabled and error", () => {
    it("should resolve with error", done => {
      success = false;
      const elroy = new Elroy({
        uuid: uuid,
        url: "https://elroy.example.com",
        secret: "xxxxxx",
        enabled: true,
        isRollback: isRollback,
        clusterName: clusterName,
        resource: resource
      });
      elroy.request = requestMock;
      elroy
        .start(manifests)
        .then(() => {
          done("Should not be successful when expecting error");
        })
        .catch(() => {
          done();
        });
    });
  });
  describe("Enabled and fail", () => {
    it("should resolve", () => {
      success = true;
      error = new Error("deploying error");
      const elroy = new Elroy({
        uuid: uuid,
        url: "https://elroy.example.com",
        secret: "xxxxxx",
        enabled: true,
        isRollback: isRollback,
        clusterName: clusterName,
        resource: resource
      });
      elroy.request = requestMock;
      elroy._started = true;
      return elroy.fail(error).then(data => {
        expect(data).to.exist;
        expect(calledWith.method).to.equal("PUT");
        expect(calledWith.uri).to.equal(
          "https://elroy.example.com/api/v1/deploy"
        );
        expect(calledWith.body).to.deep.equal({
          uuid: uuid,
          deploymentEnvironment: clusterName,
          service: resource,
          type: Type.Promotion,
          status: Status.Failure,
          error: error.toString()
        });
      });
    });
  });
  describe("Enabled and done", () => {
    it("should resolve", () => {
      success = true;
      const elroy = new Elroy({
        uuid: uuid,
        url: "https://elroy.example.com",
        secret: "xxxxxx",
        enabled: true,
        isRollback: isRollback,
        clusterName: clusterName,
        resource: resource
      });
      elroy.request = requestMock;
      elroy._started = true;
      return elroy.done().then(data => {
        expect(data).to.exist;
        expect(calledWith.method).to.equal("PUT");
        expect(calledWith.uri).to.equal(
          "https://elroy.example.com/api/v1/deploy"
        );
        expect(calledWith.body).to.deep.equal({
          uuid: uuid,
          deploymentEnvironment: clusterName,
          service: resource,
          type: Type.Promotion,
          status: Status.Success
        });
      });
    });
  });
});
