/*
 * Downloads the necessary kubectl binary before publishing so that it will be included
 * in the npm module
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

var kubectlPath = path.join(__dirname, "../bin/kubectl");
var kubectlFile = fs.createWriteStream(kubectlPath);

// Make the kubectl executable
kubectlFile
  .on("error", function(err) {
    throw err;
  })
  .on("finish", function() {
    fs.chmodSync(kubectlPath, "770");
  });

https
  .get(
    "https://storage.googleapis.com/kubernetes-release/release/" +
      process.env.KUBE_VERSION +
      "/bin/linux/amd64/kubectl",
    function(response) {
      response.pipe(kubectlFile);
    }
  )
  .on("error", function(err) {
    throw err;
  });
