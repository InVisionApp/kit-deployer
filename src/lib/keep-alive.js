"use strict";

const EventEmitter = require("events").EventEmitter;

/**
 * Print a given message at a given interval until you call the stop method
 * @param {string} message - The message you want printed out
 * @param {string} interval - The interval in seconds you want the message printed at
 * @fires Status#info
 * @return {object} promise
 */
class KeepAlive extends EventEmitter {
  constructor(message, interval) {
    super();
    this._id;
    this.interval = interval;
    this.message = message;
  }

  start() {
    this._id = setTimeout(() => {
      this.emit("info", this.message);
      this.start();
    }, parseInt(this.interval) * 1000);
  }

  stop() {
    clearTimeout(this._id);
  }
}

module.exports = KeepAlive;
