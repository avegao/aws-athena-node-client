# AWS Athena Client for NodeJS
[![Build Status](https://travis-ci.org/avegao/aws-athena-node-client.svg?branch=master)](https://travis-ci.org/avegao/aws-athena-node-client)
[![Maintainability](https://api.codeclimate.com/v1/badges/5eb885bb8f1eaf644813/maintainability)](https://codeclimate.com/github/avegao/aws-athena-node-client/maintainability)
[![Test Coverage](https://api.codeclimate.com/v1/badges/5eb885bb8f1eaf644813/test_coverage)](https://codeclimate.com/github/avegao/aws-athena-node-client/test_coverage)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=avegao_aws-athena-node-client&metric=alert_status)](https://sonarcloud.io/dashboard?id=avegao_aws-athena-node-client)

## Installation

Using NPM:
```shell
npm install aws-athena-node-client
```

Using yarn:
```shell
yarn add aws-athena-node-client
```

## Use

### Create client

```js
const athenaClient = new AthenaClient({
    awsConfig: {
        accessKeyId: 'DASCDAS82941',
        apiVersion: '2017-05-18',
        region: 'eu-west-1',
        secretAccessKey: 'CJDADDHDASIUOHADS/3123DASE12',
    },
    bucketUri: 's3://athena-query-results-eu-west-1/',
    database: 'default',
    waitTime: 0.5,
    workGroup: 'my-work-group',
});
```

### Run query
Javascript

```js
const query = `SELECT 1`;

athenaClient.executeQuery(query)
    .then((results) => {
      console.log(results);
    })
    .catch((error) => {
      console.error(error);
    });
```

Typescript

```typescript
const query = `SELECT 1`;

try {
    const results = await athenaClient.executeQuery<T>(query);
    console.log(results);
} catch (error) {
    console.error(error);
}
```

### Cancel query

```js
const query = `SELECT 1`;

athenaClient.executeQuery(query, parameters, 'hdaiuh33r8uyjdkas')
    .then((results) => {
      console.log(results);
    })
    .catch((error) => {
      if (!(error instanceof QueryCanceledException)) {
        console.error(error);
      }
    });
```

Typescript

```typescript
const query = `SELECT 1`;

try {
    const results = await athenaClient.executeQuery<T>(query, parameters, 'hdaiuh33r8uyjdkas');
    console.log(results);
} catch (error) {
    if (!(error instanceof QueryCanceledException)) {
            console.error(error);
          }
}
```

You must run this code in a distinct thread than the query execution thread.

```js
athenaClient.cancelQuery('hdaiuh33r8uyjdkas')
    .then((results) => {
      // continue
    })
    .catch((error) => {
      console.error(error);
    });
```

Typescript


```typescript
try {
    await athenaClient.cancelQuery('hdaiuh33r8uyjdkas');
} catch (error) {
    console.error(error);
}
```
