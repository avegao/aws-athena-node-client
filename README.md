# AWS Athena Client for NodeJS
[![Build Status](https://travis-ci.org/avegao/aws-athena-node-client.svg?branch=master)](https://travis-ci.org/avegao/aws-athena-node-client)

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
