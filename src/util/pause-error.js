"use strict";

/*
 * Allows to explicitly detect a pause error by extending the base Error class.
 */
class PauseError extends Error {
  constructor(name) {
    const message = "Resource " + name + " is paused";
    super(message);
    this.message = message;
    this.name = "PauseError";
  }
}

module.exports = PauseError;
