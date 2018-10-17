FROM node:6.11.5-alpine


COPY .npmrc package.json ./
RUN npm install

RUN npm install -g snyk
