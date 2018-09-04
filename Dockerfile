FROM node:6.11.5-alpine

# Defines the version of the kubectl binary
ARG KUBE_VERSION=v1.9.10

# Add kubectl binary
COPY scripts/download-kubectl.js scripts/download-kubectl.js
RUN node scripts/download-kubectl.js

# Install node modules (allows for npm install to be cached until package.json changes)
COPY .npmrc package.json ./
RUN npm install

# Set default environment variables
ENV \
	PATH=/src:/node_modules/.bin:/bin:$PATH\
	API_VERSION=v1\
	SELECTOR=\
	CONFIGS_PATTERN=/configs/**/kubeconfig\
	NAMESPACES_DIR=/namespaces\
	MANIFESTS_DIR=/manifests\
	DRY_RUN=true\
	STRATEGY=rolling-update\
	IS_ROLLBACK=false\
	DIFF=false\
	FORCE=false\
	CREATE_ONLY=false\
	RAW=false\
	BACKOFF_FAIL_AFTER=10\
	BACKOFF_INITIAL_DELAY=1000\
	BACKOFF_MAX_DELAY=30000\
	AVAILABLE_ENABLED=false\
	AVAILABLE_POLLING_INTERVAL=10\
	AVAILABLE_ALL=false\
	AVAILABLE_HEALTH_CHECK=true\
	AVAILABLE_HEALTH_CHECK_GRACE_PERIOD=10\
	AVAILABLE_HEALTH_CHECK_THRESHOLD=0\
	AVAILABLE_HEALTH_CHECK_IGNORED_ERRORS=Unhealthy,FailedScheduling\
	AVAILABLE_REQUIRED=false\
	AVAILABLE_KEEP_ALIVE=false\
	AVAILABLE_KEEP_ALIVE_INTERVAL=30\
	AVAILABLE_TIMEOUT=600\
	DEPENDENCY_WAIT=3\
	DEPENDENCY_TIMEOUT=600\
	GITHUB_ENABLED=true\
	GITHUB_AUTH_TYPE=token

# Copy our source files to the service location
COPY src /src

ENTRYPOINT ["deployer"]
