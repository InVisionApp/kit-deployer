"use strict";

const _ = require("lodash");
const fs = require("fs");
const glob = require("glob");
const yaml = require("js-yaml");
const Kubectl = require("./kubectl");
const Promise = require("bluebird");
const EventEmitter = require("events");
const Manifests = require("./manifests");
const Namespaces = require("./namespaces");
const Webhook = require("./webhook");

class Deployer extends EventEmitter {
	constructor(options) {
		super();
		this.options = _.merge({
			apiVersion: "v1",
			sha: undefined,
			selector: undefined,
			dryRun: true,
			isRollback: false,
			diff: false,
			force: false,
			deleteResources: true,
			available: {
				enabled: false,
				all: false,
				webhooks: [],
				healthCheck: true,
				healthCheckGracePeriod: undefined,
				keepAlive: false,
				keepAliveInterval: 30,
				required: false,
				timeout: 10 * 60 // 10 minutes
			},
			dependency: {
				wait: 3, // 3 seconds
				timeout: 10 * 60 // 10 minutes
			},
			github: {
				enabled: true,
				token: undefined,
				user: undefined,
				repo: undefined
			}
		}, options);
	}

	deploy(configPattern, manifestsDir, namespacesDir) {
		var self = this;
		return new Promise(function(resolve, reject) {
			var configFiles = glob.sync(configPattern);

			let webhook = undefined;
			var errors = [];
			var promises = [];

			if (!configFiles.length) {
				self.emit("warn", "No config files found using pattern: " + configPattern);
				return resolve();
			}

			if (self.options.available.webhooks.length) {
				webhook = new Webhook({
					urls: self.options.available.webhooks,
					isRollback: self.options.isRollback
				});
				webhook.on("info", (msg) => {
					self.emit("info", msg);
				});
				webhook.on("error", (msg) => {
					self.emit("error", msg);
				});
			}

			_.each(configFiles, function(configFile) {
				// Parse the cluster yaml file to JSON
				var config = yaml.safeLoad(fs.readFileSync(configFile, "utf8"));

				function clusterLog(message) {
					self.emit("info", config.metadata.name + " - " + message);
				}
				function clusterError(message) {
					self.emit("error", config.metadata.name + " - " + message);
				}
				function clusterWarning(message) {
					self.emit("warn", config.metadata.name + " - " + message);
				}

				// Verify is correct kind
				if (config.kind != "Config") {
					self.emit("fatal", "Expected kind: 'Config', found kind: '" + config.kind + "'");
					return reject();
				} else if (!config.metadata || !config.metadata.name) {
					self.emit("fatal", "Missing required 'metadata.name' property for " + configFile);
					return reject();
				}

				var kubectl = new Kubectl({
					kubeconfig: configFile,
					version: self.options.apiVersion
				});

				// Create namespaces before deploying any manifests
				var namespaces = new Namespaces({
					clusterName: config.metadata.name,
					dir: namespacesDir,
					dryRun: self.options.dryRun,
					kubectl: kubectl
				});
				namespaces.on("info", clusterLog);
				namespaces.on("error", clusterError);
				promises.push(namespaces
					.deploy()
					.then(function() {
						var manifests = new Manifests({
							sha: self.options.sha,
							cluster: config,
							dir: manifestsDir,
							selector: self.options.selector,
							github: self.options.github,
							dependency: self.options.dependency,
							dryRun: self.options.dryRun,
							available: self.options.available,
							diff: self.options.diff,
							force: self.options.force,
							deleteResources: self.options.deleteResources,
							kubectl: kubectl
						});
						manifests.on("status", (status) => {
							self.emit("status", status);
							if (webhook) {
								try {
									webhook.change(status);
								} catch (err) {
									clusterError(err);
									errors.push(err);
								}
							}
						});
						manifests.on("info", clusterLog);
						manifests.on("warning", clusterWarning);
						manifests.on("error", (msg) => {
							clusterError(msg);
							errors.push(msg);
						});
						return manifests.deploy();
					}));
			});

			Promise
				.all(promises)
				.then(() => {
					// If a webhook is set and available is required, only resolve once the webhook has finished
					if (webhook && self.options.available.enabled && self.options.available.required) {
						return webhook.sent();
					}
				})
				.catch(function(err) {
					self.emit("error", err);
					errors.push(err);
				})
				.finally(function() {
					if (self.options.dryRun) {
						self.emit("info", "This was a dry run and no changes were deployed");
					}
					if (errors.length) {
						self.emit("error", errors.length + " errors occurred");
						return reject(errors);
					}
					self.emit("info", "Finished successfully");
					return resolve();
				})
				.done();
		});
	}
}

module.exports = Deployer;
