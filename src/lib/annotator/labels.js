"use strict";

const Labels = {
  get ID() {
    return "id";
  },
  get Name() {
    return "name";
  },
  get Strategy() {
    return "strategy";
  },
  get AppName() {
    return "app.kubernetes.io/name";
  }
};

module.exports = Labels;
