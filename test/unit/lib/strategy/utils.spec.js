"use strict";

const expect = require("chai").expect;
const Utils = require("../../../../src/lib/strategy/utils");

describe.only("strategy utils", () => {
  describe("findNonMatchingReplicasets", () => {
    it("should return items with a different deploy strategy", () => {
      let items = [
        {
          metadata: {
            labels: {
              name: "test-service",
              strategy: "rolling-update"
            }
          }
        },
        {
          metadata: {
            labels: {
              name: "test-service",
              strategy: "fast-rollbacks",
              id: "some-id"
            }
          }
        }
      ];
      let mockSelectorLabels = {
        name: "test-service",
        strategy: "rolling-update"
      };
      let result = Utils.findNonMatchingReplicasets(mockSelectorLabels, items);
      expect(result).to.have.lengthOf(1);
      expect(result).to.deep.include(items[1]);
    });
    it("should return items with a subset of labels", () => {
      let items = [
        {
          metadata: {
            labels: {
              name: "test-service",
              strategy: "rolling-update"
            }
          }
        },
        {
          metadata: {
            labels: {
              name: "test-service",
              strategy: "fast-rollbacks",
              id: "some-id"
            }
          }
        },
        {
          metadata: {
            labels: {
              name: "test-service",
              strategy: "rolling-update",
              otherKey: "something"
            }
          }
        }
      ];
      let mockSelectorLabels = {
        name: "test-service",
        strategy: "rolling-update",
        otherKey: "something"
      };
      let result = Utils.findNonMatchingReplicasets(mockSelectorLabels, items);
      expect(result).to.have.lengthOf(2);
      expect(result).to.deep.include(items[1]);
      expect(result).to.deep.include(items[0]);
    });
    it("shouldn't return other fast-rollback items for the same service", () => {
      let items = [
        {
          metadata: {
            labels: {
              name: "test-service",
              strategy: "fast-rollbacks",
              id: "some-id-1"
            }
          }
        },
        {
          metadata: {
            labels: {
              name: "test-service",
              strategy: "fast-rollbacks",
              id: "some-id-2"
            }
          }
        },
        {
          metadata: {
            labels: {
              name: "test-service",
              strategy: "fast-rollbacks",
              id: "some-id-3"
            }
          }
        }
      ];
      let mockSelectorLabels = {
        name: "test-service",
        strategy: "fast-rollbacks",
        id: "some-id-3"
      };
      let result = Utils.findNonMatchingReplicasets(mockSelectorLabels, items);
      expect(result).to.have.lengthOf(0);
    });
    it("shouldn't return deployments with a different name", () => {
      let items = [
        {
          metadata: {
            labels: {
              name: "test-service-1",
              strategy: "rolling-update",
              id: "some-id-1"
            }
          }
        },
        {
          metadata: {
            labels: {
              name: "test-service-2",
              strategy: "rolling-update",
              id: "some-id-2"
            }
          }
        },
        {
          metadata: {
            labels: {
              name: "test-service-3",
              strategy: "rolling-update",
              id: "some-id-3"
            }
          }
        }
      ];
      let mockSelectorLabels = {
        name: "test-service",
        strategy: "rolling-update",
        id: "some-id-3"
      };
      let result = Utils.findNonMatchingReplicasets(mockSelectorLabels, items);
      expect(result).to.have.lengthOf(0);
    });
  });
});
