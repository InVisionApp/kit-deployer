# Contributing

## Requirements

- `docker`
- `docker-compose`
- [jet](https://codeship.com/documentation/docker/installation/)

## Installing node_modules locally

If you want to have the `node_modules` folder locally on the host system (useful for IDEs that integrate with our `eslint` for example), you can run:

```
docker build -t kit-deployer . && id=$(docker create kit-deployer) && docker cp $id:/node_modules ./node_modules && docker rm $id
```

## Running build and tests

You can use the Codeship [jet](https://codeship.com/documentation/docker/installation/) command to build and run all tests in parallel.

1. `jet steps`

Alternatively you can use docker-compose:

1. Run `cp deployer.template.env deployer.env`
1. Provided the missing env vars needed in `deployer.env`
1. Run `docker-compose up`

## Running functional tests

We were unable to get the functional tests working via Codeship, so instead you will have to test via the `test-functional` command (which uses `docker-compose` internally). This will spin up a Kubernetes cluster and then run the functional tests against it and then shutdown and delete the cluster afterwards.

1. First install [minikube](https://kubernetes.io/docs/tasks/tools/install-minikube/)
1. Then run `./test-functional`

## Manually building and running

This is an example of building the image and running it locally:

1. `docker build -t kit-deployer .`
1. `docker run --rm -v $(pwd)/clusters:/clusters kit-deployer`

## Breaking Changes

If you ever need to implement breaking changes (non-backwards-compatible changes) to this service, you should increment the major tag version accordingly. To do this, simply update the `image_tag` property for the major version registry step in `codeship-steps.yml`. Other services will have to be manually updated to point to the latest major version tag to receive the newest image, during which time any configuration adjustments needed can be made.
