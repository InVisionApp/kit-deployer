"use strict";

const _ = require("lodash");
const fs = require("fs");
const glob = require("glob");
const Promise = require("bluebird");
const path = require("path");
const yaml = require("js-yaml");
const EventEmitter = require("events");
const readFileAsync = Promise.promisify(fs.readFile);

class Namespaces extends EventEmitter {
  constructor(options) {
    super();
    this.options = _.merge(
      {
        clusterName: undefined,
        dir: undefined,
        dryRun: true,
        kubectl: undefined
      },
      options
    );
    this.kubectl = this.options.kubectl;
  }

  /**
	 * Load the yaml files for all the namespaces.
	 * @return {array} - An array list of namespaces
	 */
  load() {
    return new Promise((resolve, reject) => {
      var namespaces = [];
      if (!this.options.dir) {
        return namespaces;
      }
      glob(
        path.join(this.options.dir, this.options.clusterName + "/**/*.yaml"),
        (err, files) => {
          if (err) {
            return reject(err);
          }
          var readPromises = [];
          _.each(files, file => {
            readPromises.push(
              readFileAsync(file, "utf8").then(rawContent => {
                namespaces.push({
                  path: file,
                  content: yaml.safeLoad(rawContent)
                });
              })
            );
          });
          return Promise.all(readPromises)
            .then(() => {
              resolve(namespaces);
            })
            .catch(allErr => {
              reject(allErr);
            });
        }
      );
      return null;
    });
  }

  /**
	 * Deploys the namespaces to the cluster if they don't already exist.
	 * @fires Namespaces#debug
	 * @fires Namespaces#info
	 * @fires Namespaces#error
	 */
  deploy() {
    return new Promise((resolve, reject) => {
      this.load()
        .then(namespaces => {
          this.namespaces = namespaces;
          if (Array.isArray(this.namespaces) && this.namespaces.length === 0) {
            this.emit(
              "debug",
              "No namespace files to processs, skipping " +
                this.options.clusterName
            );
            return true;
          }
          return false;
        })
        .then(skip => {
          if (skip) {
            resolve();
            return;
          }
          this.emit("debug", "Getting list of namespaces");
          this.kubectl
            .list("namespaces")
            .then(list => {
              this.emit("info", "Found " + list.items.length + " namespaces");
              var promises = [];
              var errors = [];

              _.each(this.namespaces, namespace => {
                var found = _.find(list.items, {
                  kind: namespace.content.kind,
                  metadata: { name: namespace.content.metadata.name }
                });

                if (!found) {
                  this.emit(
                    "info",
                    "Create " + namespace.content.metadata.name + " namespace"
                  );
                  if (this.options.dryRun === false) {
                    promises.push(
                      this.kubectl
                        .create(namespace.path)
                        .then(msg => {
                          this.emit("info", msg);
                        })
                        .catch(err => {
                          this.emit(
                            "error",
                            "Error running kubectl.create('" +
                              namespace.path +
                              "') " +
                              err
                          );
                          errors.push(err);
                        })
                    );
                  }
                }
              });

              Promise.all(promises)
                .then(resolve)
                .catch(reject)
                .finally(() => {
                  if (errors.length) {
                    this.emit("error", errors.length + " errors occurred");
                    return reject(errors);
                  }
                  return null;
                });
            })
            .catch(reject);
        });
    });
  }
}

module.exports = Namespaces;
