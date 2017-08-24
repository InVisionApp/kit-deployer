"use strict";

/*
 * Allows to explicitly detect a timeout error by extending the base Error class.
 */
class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.message = message;
    this.name = "TimeoutError";
  }
}

module.exports = TimeoutError;
