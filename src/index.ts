import {
    GetQueryExecutionCommand,
    GetQueryResultsCommand,
    StartQueryExecutionCommand,
    StopQueryExecutionCommand,
} from '@aws-sdk/client-athena';
import type {
    GetQueryExecutionInput,
    GetQueryResultsInput,
    ResultSet,
    StartQueryExecutionCommandInput,
    StopQueryExecutionInput,
    AthenaClient as AwsAthenaClient,
} from '@aws-sdk/client-athena';
import {GetObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';

import type {AthenaClientConfig} from './AthenaClientConfig.js';
import {AthenaClientException} from './exception/AthenaClientException.js';
import {QueryCanceledException} from './exception/QueryCanceledException.js';
import {Query} from './Query.js';
import {Queue} from './Queue.js';
import {ResultObjectParser} from './ResultParser.js';
import type {Statistics} from './Statistics.js';

const EXPIRATION_1_DAY = 60 * 60 * 24;

export interface QueryConfig {
    readonly id?: string;
    readonly parameters?: Record<string, unknown>;
    readonly cacheInMinutes?: number;
    readonly stats?: boolean;
}

export interface QueryWithResultsInS3Config extends QueryConfig {
    s3LinkExpirationInSeconds?: number;
}

export interface QueryStream<T extends object> {
    readonly id: string;
    readonly rows: AsyncGenerator<T>;
    readonly statistics?: Statistics;
}

export class AthenaNodeClient {
    private readonly _client: AwsAthenaClient;
    private readonly _config: AthenaClientConfig;

    private readonly _queue: Queue;

    /**
     * Creates a client that runs queries through an existing AWS Athena SDK client.
     *
     * @param client AWS Athena SDK client used to send requests.
     * @param config Client configuration with the query output bucket, database, and polling interval.
     */
    public constructor(client: AwsAthenaClient, config: AthenaClientConfig) {
        this._client = client;
        this._config = config;
        this._queue = new Queue();
    }

    /**
     * Executes a query and materializes all parsed rows in memory.
     *
     * Use this method when the result set is small or when you need random access to the full array.
     *
     * @template T Row shape returned by the query.
     * @param sql SQL statement to run in Athena.
     * @param config Optional query configuration with parameters, cache age, query id, and statistics.
     * @returns The Athena execution id, parsed rows, and optional execution statistics.
     */
    public async executeQuery<T extends object>(
        sql: string,
        config?: QueryConfig,
    ): Promise<{
        id: string;
        results: T[];
        statistics?: Statistics;
    }> {
        const query = await this.executeQueryCommon<T>(sql, config);
        const results = await this.getQueryResults<T>(query);

        const response = {
            results,
            id: query.athenaId as string,
        };

        if (config?.stats) {
            const statistics = await this.getQueryStatistics(query.athenaId as string);

            Reflect.set(response, 'statistics', statistics);
        }

        return response;
    }

    /**
     * Executes a query and exposes the parsed rows as an async generator.
     *
     * Use this method for large result sets or streaming pipelines where holding the full
     * response in memory would be inefficient.
     *
     * @template T Row shape returned by the query.
     * @param sql SQL statement to run in Athena.
     * @param config Optional query configuration with parameters, cache age, query id, and statistics.
     * @returns The Athena execution id, a row generator, and optional execution statistics.
     */
    public async executeQueryStream<T extends object>(sql: string, config?: QueryConfig): Promise<QueryStream<T>> {
        const query = await this.executeQueryCommon<T>(sql, config);
        const response: QueryStream<T> = {
            id: query.athenaId as string,
            rows: this.getQueryResultsStream(query),
        };

        if (config?.stats) {
            return {
                ...response,
                statistics: await this.getQueryStatistics(query.athenaId as string),
            };
        }

        return response;
    }

    /**
     * Executes a query and returns the S3 bucket and key where Athena stored the CSV file.
     *
     * @param sql SQL statement to run in Athena.
     * @param config Optional query configuration with parameters, cache age, query id, and statistics.
     * @returns The Athena execution id, the output bucket, the object key, and optional statistics.
     */
    public async executeQueryAndGetS3Key(
        sql: string,
        config?: QueryConfig,
    ): Promise<{
        id: string;
        bucket: string;
        key: string;
        statistics?: Statistics;
    }> {
        const query = await this.executeQueryCommon(sql, config);

        if (query.s3Location == null) {
            throw new Error('Athena no returns results S3 url');
        }

        const [bucket, key] = query.s3Location.replace('s3://', '').split('/', 1);

        const response = {
            bucket,
            key: `${key ?? ''}${query.athenaId}.csv`,
            id: query.athenaId as string,
        };

        if (config?.stats) {
            const statistics = await this.getQueryStatistics(query.athenaId as string);

            Reflect.set(response, 'statistics', statistics);
        }

        return response;
    }

    /**
     * Executes a query and returns a presigned download URL for the generated CSV file.
     *
     * This method requires an S3 client to be configured in the client config.
     *
     * @param sql SQL statement to run in Athena.
     * @param config Optional query configuration with parameters, cache age, query id, statistics, and URL expiry.
     * @returns The Athena execution id, the presigned URL, and optional statistics.
     */
    public async executeQueryAndGetDownloadSignedUrl(
        sql: string,
        config?: QueryWithResultsInS3Config,
    ): Promise<{
        id: string;
        url: string;
        statistics?: Statistics;
    }> {
        if (this._config.s3Client == null) {
            throw new Error(
                '[AthenaNodeClient] S3 Client is missing, you must install @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner dependencies and fill s3Client field in configuration',
            );
        }

        const {bucket, key, statistics, id} = await this.executeQueryAndGetS3Key(sql, config);
        const command = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
        });

        const response = {
            url: await getSignedUrl(this._config.s3Client, command, {
                expiresIn: config?.s3LinkExpirationInSeconds ?? EXPIRATION_1_DAY,
            }),
            id,
        };

        if (statistics != null) {
            Reflect.set(response, 'statistics', statistics);
        }

        return response;
    }

    /**
     * Cancels an in-flight Athena query by execution id.
     *
     * @param id Athena query execution id to stop.
     */
    public async cancelQuery(id: string): Promise<void> {
        const query = this._queue.getQueryById(id);
        const input: StopQueryExecutionInput = {
            QueryExecutionId: query.athenaId,
        };

        await this._client.send(new StopQueryExecutionCommand(input));
    }

    private async executeQueryCommon<T>(sql: string, config?: QueryConfig): Promise<Query<T>> {
        const query = new Query<T>(sql, this._config.waitTimeInSeconds, config?.parameters, config?.id);

        this._queue.addQuery(query);

        query.athenaId = await this.startQueryExecution(query);

        try {
            await this.waitUntilSucceedQuery(query);
        } catch (exception) {
            this._queue.removeQuery(query);

            throw exception;
        }

        this._queue.removeQuery(query);

        return query;
    }

    /**
     * Starts query execution and gets an ID for the operation
     *
     * @private
     * @param {Query} query - Athena request params
     * @returns {Promise<string>} - query execution id
     * @memberof AthenaNodeClient
     */
    private async startQueryExecution<T>(query: Query<T>): Promise<string> {
        const input: StartQueryExecutionCommandInput = {
            QueryExecutionContext: {
                Database: this._config.database,
            },
            QueryString: query.sql,
            ResultConfiguration: {
                OutputLocation: this._config.bucketUri,
            },
        };

        if (this._config.workGroup != null) {
            input.WorkGroup = this._config.workGroup;
        }

        if ((query.cacheInMinutes ?? 0) > 0) {
            input.ResultReuseConfiguration = {
                ResultReuseByAgeConfiguration: {
                    Enabled: true,
                    MaxAgeInMinutes: query.cacheInMinutes,
                },
            };
        }

        const response = await this._client.send(new StartQueryExecutionCommand(input));

        if (response.QueryExecutionId != null) {
            return response.QueryExecutionId;
        }

        throw new Error('[AthenaNodeClient] Athena no returns query execution id. This may be a problem in AWS side.');
    }

    /**
     * Processes query results and parses them
     *
     * @private
     * @template T
     *
     * @param {Query<T>} query
     * @param {string} nextToken
     *
     * @returns {Promise<T[]>} - parsed query result rows
     * @memberof AthenaNodeClient
     */
    private async getQueryResults<T extends object>(query: Query<T>): Promise<T[]> {
        let nextToken: string | undefined;
        let isFirstPage = true;

        do {
            const {nextToken: responseNextToken, resultSet} = await this.getQueryResultsPage(
                query.athenaId as string,
                nextToken,
            );

            if (query.resultParser == null) {
                query.resultParser = new ResultObjectParser(resultSet);
                query.columns = query.resultParser.columns;
            }

            query.resultParser.appendRows(query.results, resultSet.Rows ?? [], isFirstPage);

            nextToken = responseNextToken;
            isFirstPage = false;
        } while (nextToken != null);

        return query.results;
    }

    private async *getQueryResultsStream<T extends object>(query: Query<T>): AsyncGenerator<T> {
        let nextToken: string | undefined;
        let isFirstPage = true;

        do {
            const {nextToken: responseNextToken, resultSet} = await this.getQueryResultsPage(
                query.athenaId as string,
                nextToken,
            );

            if (query.resultParser == null) {
                query.resultParser = new ResultObjectParser(resultSet);
                query.columns = query.resultParser.columns;
            }

            const rows = resultSet.Rows ?? [];

            for (let rowIndex = isFirstPage ? 1 : 0; rowIndex < rows.length; rowIndex++) {
                yield query.resultParser.parseRow(rows[rowIndex]);
            }

            nextToken = responseNextToken;
            isFirstPage = false;
        } while (nextToken != null);
    }

    private async getQueryResultsPage(
        queryExecutionId: string,
        nextToken?: string,
    ): Promise<{
        readonly nextToken?: string;
        readonly resultSet: ResultSet;
    }> {
        const input: GetQueryResultsInput = {
            NextToken: nextToken,
            QueryExecutionId: queryExecutionId,
        };

        const response = await this._client.send(new GetQueryResultsCommand(input));
        const resultSet = response.ResultSet;

        if (resultSet == null) {
            throw new Error('[AthenaNodeClient] No query results. This may be a problem in AWS side.');
        }

        return {
            nextToken: response.NextToken,
            resultSet,
        };
    }

    /**
     * Get statistics from a query execution
     *
     * @private
     * @template T
     *
     *
     * @returns {Promise<T[]>} - parsed query result rows
     * @memberof AthenaNodeClient
     * @param {string} executionId
     */
    private async getQueryStatistics(executionId: string): Promise<Statistics> {
        const input: GetQueryExecutionCommand = new GetQueryExecutionCommand({
            QueryExecutionId: executionId,
        });

        const response = await this._client.send(input);
        const bytes = response?.QueryExecution?.Statistics?.DataScannedInBytes;
        const timeInSeconds = (response?.QueryExecution?.Statistics?.EngineExecutionTimeInMillis ?? 0) / 1000;

        return {
            dataScannedInBytes: bytes,
            executionTimeInSeconds: timeInSeconds,
        };
    }

    /**
     * Checks the query execution status until the query sends SUCCEEDED signal
     *
     * @private
     * @param {Query} query - the query
     * @returns {Promise<void>} - promise that will resolve once the operation has finished
     * @memberof AthenaNodeClient
     */
    private async waitUntilSucceedQuery(query: Query<unknown>): Promise<void> {
        const input: GetQueryExecutionInput = {
            QueryExecutionId: query.athenaId,
        };

        const waitTime = this._config.waitTimeInSeconds * 1000;

        while (true) {
            await this.sleep(waitTime);

            const response = await this._client.send(new GetQueryExecutionCommand(input));
            query.status = response.QueryExecution?.Status?.State;

            switch (query.status) {
                case 'SUCCEEDED':
                    query.s3Location = response?.QueryExecution?.ResultConfiguration?.OutputLocation;

                    return;
                case 'QUEUED':
                case 'RUNNING':
                    break;
                case 'CANCELLED':
                    throw new QueryCanceledException();
                case 'FAILED':
                    throw new AthenaClientException('Query failed');
                default:
                    throw new AthenaClientException(`Query Status '${query.status}' not supported`);
            }
        }
    }

    private async sleep(milliseconds: number): Promise<void> {
        await new Promise((resolve) => {
            setTimeout(resolve, milliseconds);
        });
    }
}
