"use strict";

const AWS = require("aws-sdk");
const Promise = require("bluebird");
const bucket = process.env.AWS_BUCKET;
const enabled = (process.env.BACKUP_ENABLED || false);
const saveFormat = ( process.env.SAVE_FORMAT === "json" ? "json" : "yaml" );
const yaml = require("js-yaml");


// validate required ENVs if enabled
if ( enabled && ( !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !bucket ) ) {
	throw new Error("Missing required ENV's, validate AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_BUCKET exist");
}

let s3;

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
const save = function( clusterName, manifest ) {

	return new Promise((resolve, reject) => {

		if (!clusterName || !manifest) { return reject("Cluster or Manifest not supplied") }

		// If disabled skip processing
		if (enabled === "false" || enabled === false) { return resolve(); }

		// Create the s3 object if not already
		if ( !s3 ) { s3 = new AWS.S3(); }

		const name = manifest.metadata.name;
		let s3Request = {
			Bucket: bucket,
			Key: `${clusterName}/${manifest.metadata.name}.${saveFormat}`,
			ServerSideEncryption: "AES256"
		};

		if (saveFormat === "yaml") {
			// convert to YAML before save
			 s3Request.Body = yaml.safeDump(manifest, {});
		} else {
			s3Request.Body = manifest;
		}
		// Save file to s3 bucket.
		s3.putObject(s3Request, function(err, data) {
			if (err) {
				return reject(err);
			}
			return resolve(data);
		});
	});
}

module.exports = save;
