"use strict";

const AWS = require("aws-sdk");
const Promise = require("bluebird");
const EventEmitter = require("events");
const yaml = require("js-yaml");

/**
 * The AWS sdk requires these ENVs to be set:
 * 		AWS_ACCESS_KEY_ID
 * 		AWS_SECRET_ACCESS_KEY
 */
class Backup extends EventEmitter {
  constructor(enabled, bucket, saveFormat, dryRun) {
    super();
    this.options = {
      dryRun: dryRun || false,
      enabled: enabled === true || enabled === "true",
      bucket: bucket,
      saveFormat: saveFormat === "json" ? "json" : "yaml"
    };
    if (
      this.options.enabled &&
      (!process.env.AWS_ACCESS_KEY_ID ||
        !process.env.AWS_SECRET_ACCESS_KEY ||
        !this.options.bucket)
    ) {
      throw new Error(
        "Missing required ENV's, validate AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_BUCKET exist"
      );
    }
    if (this.options.enabled) {
      this.s3 = new AWS.S3();
    }
    this.emit(
      "info",
      `Backup is ${this.options.enabled} for bucket ${this.options.bucket}`
    );
  }

  /**
	 * Backs up the provided manifest to a s3 bucket.
	 * Path is <BUCKET>/<clusterName>/<manifest-name>
	 * Requires AWS Credentials as EV's:
	 * AWS_ACCESS_KEY_ID
	 * AWS_SECRET_ACCESS_KEY
	 *   as well as the AWS_BUCKET
	 *
	 * @param  {[type]} clusterName [description]
	 * @param  {[type]} manifest    [description]
	 * @return {[type]}             [description]
	 */
  save(clusterName, manifest) {
    return new Promise((resolve, reject) => {
      if (!clusterName || !manifest) {
        return reject("Cluster or Manifest not supplied for S3 Backup");
      }

      // If NOT enabled skip processing
      if (!this.options.enabled) {
        return resolve();
      }

      const s3Request = {
        Bucket: this.options.bucket,
        Key: `${clusterName}/${manifest.metadata.name}.${this.options
          .saveFormat}`,
        ServerSideEncryption: "AES256"
      };

      if (this.options.saveFormat === "yaml") {
        // convert to YAML before save
        s3Request.Body = yaml.safeDump(manifest, {});
      } else {
        s3Request.Body = manifest;
      }
      // Save file to s3 bucket.
      if (this.options.dryRun) {
        this.emit(
          "info",
          `DryRun is enabled: skipping saving file ${clusterName}/${manifest
            .metadata.name}.${this.options.saveFormat} to S3`
        );
        return resolve();
      }
      this.s3.putObject(s3Request, (err, data) => {
        if (err) {
          this.emit("warn", `Issue saving backup to S3: ${err.message}`);
          return reject(err);
        }
        this.emit(
          "debug",
          `Saved file ${clusterName}/${manifest.metadata.name}.${this.options
            .saveFormat} to S3`
        );
        return resolve(data);
      });
      return null;
    });
  }
}

module.exports = Backup;
