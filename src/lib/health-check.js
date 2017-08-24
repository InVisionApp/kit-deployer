"use strict";

const _ = require("lodash");
const EventEmitter = require("events").EventEmitter;
const EventError = require("../util/event-error");

const errorReasons = [
  "NodeOutOfDisk",
  "BackOff",
  "ImagePullBackOff",
  "Failed",
  "FailedSync",
  "MissingClusterDNS",
  "NodeNotSchedulable"
];
const excludeReasons = [
  // We ignore Unhealthy events because often services can fail checks on startup/terminating and cause false positives
  "Unhealthy"
];

/**
 * @fires HealthCheck#debug
 * @fires HealthCheck#error
 */
class HealthCheck extends EventEmitter {
  constructor(kubectl, gracePeriod, since, threshold, interval) {
    super();
    this.events = kubectl.events(since, interval);
    this.error = {
      timeoutId: null,
      involvedObjectName: null
    };
    this.beingKilled = [];
    this.gracePeriod =
      typeof gracePeriod === "undefined" ? 10 * 1000 : gracePeriod * 1000; // Default is 10 seconds
    this.threshold = typeof threshold === "undefined" ? 0 : threshold; // Default is 0
  }

  start(name) {
    this.events.on("error", err => {
      this.emit("error", err);
    });
    this.events.on("new", event => {
      if (!_.has(event, ["type"])) {
        return;
      }
      if (!_.has(event, ["reason"]) || !_.isString(event.reason)) {
        return;
      }

      // Only concern ourselves with events that match name
      if (
        !(
          _.has(event, ["involvedObject", "name"]) &&
          event.involvedObject.name.startsWith(name)
        )
      ) {
        return;
      }

      // Ignore events for involved objects that are being killed
      if (this.beingKilled.indexOf(event.involvedObject.name) >= 0) {
        if (this.error.involvedObjectName == event.involvedObject.name) {
          this.emit(
            "debug",
            "Clearing healthcheck timeout because " +
              event.involvedObject.name +
              " is being killed"
          );
          clearTimeout(this.error.timeoutId);
          this.error = {
            timeoutId: null,
            involvedObject: null
          };
        }
        return;
      }

      // If we encounter a Killing event for any involvedObject we should not care about it's health
      // A "Killing" event is of type "Normal" and means that a pod is purposefully being killed
      if (event.reason == "Killing") {
        this.emit(
          "debug",
          "Healthcheck ignoring events for " +
            event.involvedObject.name +
            " because it's being killed"
        );
        this.beingKilled.push(event.involvedObject.name);
        return;
      }

      // Skip reasons that are excluded from checking
      if (excludeReasons.indexOf(event.reason) >= 0) {
        return;
      }

      // Once an error has been detected, we don't care about future errors
      if (this.error.timeoutId !== null) {
        return;
      }

      if (event.type != "Normal" || errorReasons.indexOf(event.reason) >= 0) {
        this.emit(
          "debug",
          "Healthcheck detected " +
            event.reason +
            " error occurred " +
            event.count +
            " times for " +
            event.involvedObject.name
        );

        // Only throw error once that error has occurred more times than the threshold
        if (event.count > this.threshold) {
          // Emit error unless stop is called before grace period expires
          this.emit(
            "info",
            "Healthcheck detected " +
              event.reason +
              " error exceeded threshold of " +
              this.threshold +
              " for " +
              event.involvedObject.name +
              ", waiting grace period " +
              this.gracePeriod +
              "ms before emitting"
          );
          this.error.involvedObjectName = event.involvedObject.name;
          this.error.timeoutId = setTimeout(() => {
            this.emit(
              "info",
              "Healthcheck grace period of " + this.gracePeriod + "ms expired"
            );
            // Avoid emitting an uncaught error if listeners have already stopped listening
            const eventError = new EventError(event);
            if (this.listenerCount("error")) {
              this.emit("error", eventError);
            } else {
              this.emit(
                "debug",
                "Nothing is listening for healthcheck errors, will not emit event error: " +
                  eventError.message
              );
            }
          }, this.gracePeriod);
        }
      }
    });
    this.events.start();
  }

  stop() {
    this.emit("info", "Stopping healthcheck watcher");
    this.events.stop();
    if (this.error.timeoutId !== null) {
      this.emit("info", "Clearing healthcheck timeout");
      clearTimeout(this.errorTimeoutId);
      this.error = {
        timeoutId: null,
        involvedObject: null
      };
    }
    this.removeAllListeners();
  }
}

module.exports = HealthCheck;
