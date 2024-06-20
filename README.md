# AWS Athena Client for NodeJS

## Installation

Using NPM:
```shell
npm install aws-athena-node-client @aws-sdk/client-athena
```

Using yarn:
```shell 
yarn add aws-athena-node-client @aws-sdk/client-athena
```

Using pnpm:
```shell
pnpm add aws-athena-node-client @aws-sdk/client-athena
```

## Use

### Create client

```ts
const athenaNodeClient = new AthenaNodeClient({
    bucketUri: 's3://athena-query-results-eu-west-1/',
    database: 'default',
    waitTime: 0.5,
    workGroup: 'my-work-group',
});
```

### Run query

```ts
const query = `SELECT 1`;

try {
    const results = await athenaNodeClient.executeQuery<T>(query);
    console.log(results);
} catch (error) {
    console.error(error);
}
```


#### Cache
If you want to use AWS Athena cache, you can specify that cache in minutes. If you don't
provide this query configuration, Athena doesn't use this cache.

```ts
const results = await athenaNodeClient.executeQuery<T>(query, {
    cacheInMinutes: 60,
});
```

#### Parameters

This project doesn't support native query parameters becase I consider that are very simple and useless, then this project
use [pg-promise](https://github.com/vitaly-t/pg-promise) package to format the SQL with parameters to prevent SQL
Injection attacks. You can visit https://github.com/vitaly-t/pg-promise?tab=readme-ov-file#named-parameters for more
info.

```ts
const query = 'SELECT name, surname, age FROM users WHERE name = $(name) AND surname = $(surname)';

const results = await athenaNodeClient.executeQuery<T>(query, {
    parameters: {
        name: 'John',
        surname: 'Doe',
    },
});
```

#### Run query and get S3 URL with results

You need to install `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`

```shell
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

```ts
const query = `SELECT 1`;

try {
    const results = await athenaNodeClient.executeQueryAndGetS3Url(query);
    console.log(results);  // Print s3://S3_BUCKET_NAME/QUERY_ID.csv
} catch (error) {
    console.error(error);
}
```

### Cancel query

```ts
const query = `SELECT 1`;

try {
    const results = await athenaNodeClient.executeQuery<T>(query, {
        parameters,
        id: 'hdaiuh33r8uyjdkas',
    });
    console.log(results);
} catch (error) {
    if (!(error instanceof QueryCanceledException)) {
        console.error(error);
    }
}
```

You must run this code in a distinct thread than the query execution thread.

```ts
try {
    await athenaNodeClient.cancelQuery('hdaiuh33r8uyjdkas');
} catch (error) {
    console.error(error);
}
```


## Upgrade from v1 to v2

- Client class renamed to `AthenaNodeClient` to prevent issues with `@aws-sdk/client-athena` classes naming.
- Now you must instance `AthenaClient` from `@aws-sdk/client-athena` package. This is to optimize support for AWS Lambda
functions (`@aws-sdk/*` packages are included in AWS Lambda runtime), use the most updated version of this 
package in your project and you can use more custom configurations in the AWS SDK client, like roles. You need to execute:

```shell
pnpm add @aws-sdk/client-athena
```

Before

```ts
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

After

```ts
import {AthenaClient} from '@aws-sdk/client-athena';

const athena = new AthenaClient({});

const athenaNodeClient = new AthenaNodeClient(athena, {
    bucketUri: 's3://athena-query-results-eu-west-1/',
    database: 'default',
    waitTime: 0.5,
    workGroup: 'my-work-group',
});
```

- If you use methods `executeQueryAndGetS3Key` `executeQueryAndGetDownloadSignedUrl` now you must create your S3 client
before. The reason is the same with the Athena client. You need to execute:

```shell
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

Before

```ts
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

After

```ts
import {AthenaClient} from '@aws-sdk/client-athena';
import {S3} from '@aws-sdk/client-s3';

const athena = new AthenaClient({});
const s3 = new S3({
    useDualstackEndpoint: true, // recommended to support IPv6
});

const athenaNodeClient = new AthenaNodeClient(athena, {
    bucketUri: 's3://athena-query-results-eu-west-1/',
    database: 'default',
    waitTime: 0.5,
    workGroup: 'my-work-group',
    s3Client: s3,
});
```

- Method `executeQueryAndGetS3Url` is renamed to `executeQueryAndGetS3Key` and now returns and object with the S3 bucket
and key of the object generated by Athena instead of returns an S3 schema url. If you want a direct URL to download the
results, you must use `executeQueryAndGetDownloadSignedUrl` method.

- All query related method, now have 2 parameters, sql and query config. The query parameters and query id, must be 
inside this second parameter:

Before

```ts
const results = await athenaClient.executeQuery<T>(query, parameters, queryId);
```

After

```ts
const results = await athenaNodeClient.executeQuery<T>(query, {
    parameters: {
        name: 'John',
        surname: 'Doe',
    },
    id: 'abcd',
    cacheInMinutes: 60,
});
```

## Upgrade from v2 to v3

- There is a new statistics parameter in QueryConfig. Now the executeQuery methods will also return a statistics object if the stats parameter is true. By default stats value is false.

### athenaNodeClient.executeQuery<T>()

Before

```ts
const results = await athenaNodeClient.executeQuery<T>(query);

```
- V2 Response example:
```json
[
  {
    "result": "1"
  },
  {
    "result": "2"
  }
]
```

After

- If the statistics parameter is true, the method returns an object with results and statistics, otherwise it will return an array of objects.

```ts
const result = await athenaNodeClient.executeQuery<T>(query, {
    stats: false
});
// OR
const {results, statistics} = await athenaNodeClient.executeQuery<T>(query, {
    stats: true
});
```
- V3 response example with stats false or without stats param:
```json
[
    {
      "result": "1"
    },
    {
      "result": "2"
    }
]
```

```json
{
  "results": [
    {
      "result": "1"
    },
    {
      "result": "2"
    }
  ],
  "statistics": { 
    "dataScannedInBytes": 26376236, 
    "executionTimeInSeconds": 2.703
  }
}
```

### athenaNodeClient.executeQueryAndGetS3Key<T>()

Before

```ts
const {bucket, key} = await athenaNodeClient.executeQueryAndGetS3Key<T>(query);
```
- V2 Response example:
```json
{
  "bucket": "bucket-test",
  "key": "123-key.csv"
}
```

After

If the statistics parameter is true, the method returns an object with bucket, key and statistics, otherwise it will return an object with bucket and key.

```ts
const {bucket, key, statistics} = await athenaNodeClient.executeQueryAndGetS3Key<T>(query, {
    stats: true | false
});

```
- V3 response example with stats false or without stats param:
```json
{
  "bucket": "bucket-test",
  "key": "123-key.csv"
}
```

- V3 response example with stats true:
```json
{
  "bucket": "bucket-test",
  "key": "123-key.csv",
  "statistics": { 
    "dataScannedInBytes": 26376236, 
    "executionTimeInSeconds": 2.703
  }
}

```

### athenaNodeClient.executeQueryAndGetDownloadSignedUrl<T>()

Before

```ts
const url = await athenaNodeClient.executeQueryAndGetDownloadSignedUrl<T>(query);
```
- V2 response example:
```json
"https://bucket-test..."
```

After

If the statistics parameter is true, the method returns an object with url and statistics, otherwise it will return an object with url.

```ts
const {url, statistics} = await athenaNodeClient.executeQueryAndGetDownloadSignedUrl<T>(query, {
    stats: true | false
});

```
- V3 response example with stats false or without stats param:
```json
{
  "url": "https://bucket-test..."
}
```

- V3 response example with stats true:
```json
{
  "url": "https://bucket-test...",
  "statistics": { 
    "dataScannedInBytes": 26376236, 
    "executionTimeInSeconds": 2.362
  }
}

```
