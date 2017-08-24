"use strict";

var GitHubApi = require("github");
var Promise = require("bluebird");

var github = new GitHubApi({
  version: "3.0.0"
});

module.exports = function(token) {
  var getCommit = Promise.promisify(github.repos.getCommit);
  var cache = {};

  github.authenticate({
    type: "token",
    token: token
  });

  // Return github data on commit
  this.getCommit = function(user, repo, sha) {
    // Return result we already have cached if it exists
    if (cache[sha]) {
      return Promise.resolve(cache[sha]);
    }

    var request = {
      user: user,
      repo: repo,
      sha: sha
    };

    return getCommit(request).then(function(res) {
      cache[sha] = res;
      return cache[sha];
    });
  };
};
