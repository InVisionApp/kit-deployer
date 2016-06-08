<p align="center">
  <a href="http://gulpjs.com">
    <img src="https://github.com/InVisionApp/kit-deployer/raw/master/media/kit-logo-horz-sm.png">
  </a>
</p>

# kit-deployer
[ ![Codeship Status for InVisionApp/kit-deployer](https://codeship.com/projects/71a53610-0fe1-0134-46a8-063ac029d855/status?branch=master)](https://codeship.com/projects/156809)
[![npm version](https://badge.fury.io/js/kit-deployer.svg)](https://badge.fury.io/js/kit-deployer)
[![Dependency Status](https://david-dm.org/InVisionApp/kit-deployer.svg)](https://david-dm.org/InVisionApp/kit-deployer)
[![devDependency Status](https://david-dm.org/InVisionApp/kit-deployer/dev-status.svg)](https://david-dm.org/InVisionApp/kit-deployer#info=devDependencies)

Use this service to deploy files to multiple Kubernetes clusters. You just have to organize your manifest files into directories that match the names of your clusters (the name defined in your kubeconfig files). Then you just provide a directory of kubeconfig files and the `kit-deployer` will asynchronously send all manifests up to their corresponding clusters.

There is also support for namespaces. Simply provide a directory with namespaces that are grouped into folders that match the name of the kubeconfig cluster you want them deployed to.

The `kit-deployer` service was designed to work for a CI type service like Codeship where it can be run as a docker image as part of your automated workflow. However, you can also use it as an npm module or as a CLI tool directly.

## Use as Docker Image

```
docker run quay.io/invision/kit-deployer --help
```

We recommend using `kit` components with [Codeship's Docker Infrastructure](https://codeship.com/documentation/docker/), however you are free to run this tool however way you wish. Anything that has Docker can run this image.

## Using as CLI

You can run the `./src/deployer --help` to see how it works.

Note this method requires node and was tested on version `5.5.0`.

## Using as npm module

Use npm to install `kit-deployer`:

```
$ npm install kit-deployer --save
```

Then require it and use it like so:

```js
var Deployer = require("kit-deployer").Deployer;

var options = {
	sha: "c6350f4c2709708b8f784408a440030e704b2b9a",
	dryRun: true,
	diff: true,
	github: {
		token: "ccd50691c75bc7bae0a5490ea08ff9dcc9c264a5",
		user: "chesleybrown",
		repo: "my-app"
	}
};

var deployer = new Deployer(options);

// setup logging of events
deployer.on("info", function(message) {
	console.log(message);
});
deployer.on("warn", function(message) {
	console.log(message);
});
deployer.on("error", function(message) {
	console.log(message);
});
deployer.on("fatal", function(message) {
	console.log(message);
});
deployer.on("status", function(status) {
	console.log(status);
});

deployer
	.deploy("/configs/**/kubeconfig", "/manifests", "/namespaces")
	.then(console.log)
	.catch(console.error)
	.done();
```

Note this method requires node and was tested on version `5.5.0`.

## Namespaces

To create a Namespace within a given cluster, simply provide the namespace files within a directory matching the name of the cluster. So if you had a cluster called `my-cluster`, you could place the following contents into a file called `./namespaces/my-cluster/example-namespace.yaml`.

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: example
```

## Manifests

All manifest files should be placed into directories corresponding to the name of the cluster + namespace they are for. So for example, if you wanted to deploy manifests to a cluster called `my-cluster`, you could place all the manifest files into `./manifests/my-cluster/**/*.yaml`.

### Supported Types

Currently we only properly support the following types to be used as manifests. Any other type used will not be deployed and will display a warning:

- `Deployment`
- `Job`
- `Secret`
- `Service`
- `DaemonSet`
- `PersistentVolumeClaim`

### Order of Deploys (beta)

**NOTE: this feature is a work in progress and may not function correctly**

By default, all manifests are deployed to a given cluster at the same time. If however you require manifests to be deployed in a specific order you can utilize the "dependency-selector". By specifying a manifest with dependencies on other resources, the deployer will only deploy that manifest once those other services are fully available on the cluster.

You can specify dependencies using a metadata annotation called `kit-deployer/dependency-selector`. It should be a valid [label selector](http://kubernetes.io/docs/user-guide/labels/). For example:

```yaml
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: proxy-deployment
  annotations:
    kit-deployer/dependency-selector: database=mongo,env=prod
```

### Supported Dependency Types

Currently we only properly support the following types to be used as dependencies:

- `Deployment`
- `Job`
- `Secret`
- `Service`

## Expected environment variables

The following environment variables are used by this service.

| Variable | Description | Required | Default |
| :--- | :--- | :--- | :--- |
| `API_VERSION` | The kubernetes api version to use | yes | `v1` |
| `CI_COMMIT_ID` | The commit sha that we are deploying. Needed if `GITHUB_ENABLED=true` | no | *empty* |
| `SELECTOR` | Selector (label query) to filter on | no | *empty* |
| `CONFIGS` | Set the pattern to search for cluster config files | yes | `/configs/**/kubeconfig` |
| `NAMESPACES_DIR` | Set the directory where all the namespace files are. They should be grouped in folders matching the metadata.name of the cluster that you want them deployed to | yes | `/namespaces` |
| `MANIFESTS_DIR` | Set the directory where all the manifest files are. They should be grouped in folders matching the metadata.name of the cluster that you want them deployed to | yes | `/manifests` |
| `DRY_RUN` | Will only show the diff and will not push anything to the cluster | yes | `true` |
| `IS_ROLLBACK` | A boolean flag that is passed in the available payload post | yes | `false` |
| `DIFF` | Will show a diff | yes | `false` |
| `FORCE` | Will push all changes even if there are no differences | yes | `false` |
| `AVAILABLE_ENABLED` | Will check if deployed service is available, but will only affect if deployment is considered successful or not if --available-required is also enabled | yes | `false` |
| `AVAILABLE_WEBHOOK` | The URL you want to send the status payload of the deployment progress to. You can provide multiple endpoints by using a JSON array of URLs | no | *empty* |
| `AVAILABLE_REQUIRED` | Will only finish once the manifest is considered available in the cluster | yes | `false` |
| `AVAILABLE_KEEP_ALIVE` | Will print the status of the available check every `AVAILABLE_KEEP_ALIVE_INTERVAL` seconds (useful for CI tools that require log output to prevent timeouts) | yes | `false` |
| `AVAILABLE_KEEP_ALIVE_INTERVAL` | Determines the interval at which the keep alive message will be printed | yes | `30` |
| `AVAILABLE_TIMEOUT` | The number of seconds to wait for a given manifest to be available | yes | `3600` |
| `DEPENDENCY_WAIT` | The number of seconds to wait between status check attempts for a dependency | yes | `3` |
| `DEPENDENCY_TIMEOUT` | The number of seconds to wait before timing out waiting for a dependency to be available | yes | `3600` |
| `GITHUB_ENABLED` | If true, will check the date of the commit against github and will only deploy if the commit is newer than what is on the cluster. | yes | `true` |
| `GITHUB_AUTH_TOKEN` | Your github token to the repo we are deploying (used to retrieve additional info on the commit) | yes | *empty* |
| `GITHUB_USER` | The github user that the repo belongs to | yes | *empty* |
| `GITHUB_REPO` | The github repo name | yes | *empty* |

## Contributing

See the [Contributing guide](/CONTRIBUTING.md) for steps on how to contribute to this project.

## TODO

- [ ] Write proper documentation
- [ ] Improve the diff used on arrays that use `name` as keys (such as `env`) such that the order shouldn't matter in these situations, just that the key -> value remains the same
- [ ] Check the manifests and verify they match `SELECTOR` before every deploying them
