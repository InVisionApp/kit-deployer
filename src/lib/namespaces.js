"use strict";

const _ = require("lodash");
const fs = require("fs");
const glob = require("glob");
const Promise = require("bluebird");
const path = require("path");
const yaml = require("js-yaml");
const EventEmitter = require("events");

class Namespaces extends EventEmitter {
	constructor(options) {
		super();
		this.options = _.merge({
			clusterName: undefined,
			dir: undefined,
			dryRun: true,
			kubectl: undefined
		}, options);
		this.kubectl = this.options.kubectl;

		this.namespaces = this.load();
	}

	/**
	 * Load the yaml files for all the namespaces.
	 * @return {array} - An array list of namespaces
	 */
	load() {
		var namespaces = [];
		if (!this.options.dir) {
			return namespaces;
		}
		var files = glob.sync(path.join(this.options.dir, this.options.clusterName + "/**/*.yaml"));
		_.each(files, (file) => {
			namespaces.push({
				path: file,
				content: yaml.safeLoad(fs.readFileSync(file, "utf8"))
			});
		});
		return namespaces;
	}

	/**
	 * Deploys the namespaces to the cluster if they don't already exist.
	 * @param {string} resource - A single resource type to watch
	 * @fires Namespaces#debug
	 * @fires Namespaces#info
	 * @fires Namespaces#error
	 */
	deploy() {
		return new Promise((resolve, reject) => {
			this.emit("debug", "Getting list of namespaces");
			this.kubectl
				.list("namespaces")
				.then((list) => {
					this.emit("info", "Found " + list.items.length + " namespaces");
					var promises = [];
					var errors = [];

					_.each(this.namespaces, (namespace) => {
						var found = _.find(list.items, {kind: namespace.content.kind, metadata: {name: namespace.content.metadata.name}});

						if (!found) {
							this.emit("info", "Create " + namespace.content.metadata.name + " namespace");
							if (this.options.dryRun === false) {
								promises.push(this.kubectl.create(namespace.path)
									.then((msg) => {
										this.emit("info", msg);
									})
									.catch((err) => {
										this.emit("error", "Error running kubectl. create('" + namespace.path + "') " + err);
										errors.push(err);
									}));
							}
						}
					});

					Promise
						.all(promises)
						.then(resolve)
						.catch(reject)
						.finally(() => {
							if (errors.length) {
								this.emit("error", errors.length + " errors occurred");
								return reject(errors);
							}
						});
				})
				.catch(reject);
		});
	}
}

module.exports = Namespaces;
