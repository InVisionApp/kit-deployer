"use strict";

const Annotations = {
  get UUID() {
    // I'm sorry for the inconsistency...
    return "deployment.invision/uuid";
  },
  get Commit() {
    return "kit-deployer/commit";
  },
  get OriginalName() {
    return "kit-deployer/original-name";
  },
  get LastAppliedConfiguration() {
    return "kit-deployer/last-applied-configuration";
  },
  get LastAppliedConfigurationHash() {
    return "kit-deployer/last-applied-configuration-sha1";
  },
  get LastUpdated() {
    return "kit-deployer/last-updated";
  },
  get ReleaseID() {
    return "deployment.invision/release-id";
  }
};

module.exports = Annotations;
