import {AthenaClientConfig} from './AthenaClientConfig.js';
import {Queue} from './Queue.js';
import {Query} from './Query.js';
import {Column, ColumnParse} from './Column.js';
import {
    AthenaClient as AwsAthenaClient,
    GetQueryExecutionCommand,
    GetQueryExecutionInput,
    GetQueryResultsCommand,
    GetQueryResultsInput,
    ResultSet,
    Row,
    StartQueryExecutionCommand,
    StartQueryExecutionCommandInput,
    StopQueryExecutionCommand,
    StopQueryExecutionInput,
} from '@aws-sdk/client-athena';
import {setInterval} from 'timers/promises';
import {AthenaClientException} from './exception/AthenaClientException.js';
import {QueryCanceledException} from './exception/QueryCanceledException.js';
import {GetObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {Statistics} from "./Statistics.js";

const expiration1Day = 60 * 60 * 24;

enum AthenaDataTypeEnum {
    Integer = 'integer',
    Float = 'float',
    Double = 'double',
    Decimal = 'decimal',
    Char = 'char',
    Varchar = 'varchar',
    Boolean = 'boolean',
    Binary = 'binary',
    Date = 'date',
    Timestamp = 'timestamp',
    TimestampWithTz = 'timestamp with time zone',
    Array = 'array',
    Json = 'json',
    Map = 'map',
    String = 'string',
    Struct = 'struct',
    TinyInt = 'tinyint',
    SmallInt = 'smallint',
    BigInt = 'bigint',
}

export interface QueryConfig {
    readonly id?: string;
    readonly parameters?: Record<string, unknown>;
    readonly cacheInMinutes?: number;
    readonly stats?: boolean;
}

export interface QueryWithResultsInS3Config extends QueryConfig {
    s3LinkExpirationInSeconds?: number;
}

export class AthenaNodeClient {
    private readonly _client: AwsAthenaClient;
    private readonly _config: AthenaClientConfig;

    private _queue: Queue;

    public constructor(client: AwsAthenaClient, config: AthenaClientConfig) {
        this._client = client;
        this._config = config;
        this._queue = new Queue();
    }

    public async executeQuery<T extends object>(sql: string, config?: QueryConfig): Promise<{
        results: T[],
        statistics?: Statistics
    } | T[]> {
        const query = await this.executeQueryCommon<T>(sql, config);
        const results = await this.getQueryResults<T>(query);

        if (config?.stats) {
            return {
                results,
                statistics: await this.getQueryStatistics(query.athenaId as string)
            };
        } else {
            return this.getQueryResults<T>(query);
        }
    }

    /**
     * Execute query in Athena and get S3 URL with CSV file
     */
    public async executeQueryAndGetS3Key(sql: string, config?: QueryConfig): Promise<{
        bucket: string;
        key: string;
        statistics?: Statistics
    }> {
        const query = await this.executeQueryCommon(sql, config);

        if (query.s3Location == null) {
            throw new Error('Athena no returns results S3 url');
        }

        const [bucket, key] = query.s3Location.replace('s3://', '').split('/', 1);

        const returnObj = {
            bucket,
            key: `${key ?? ''}${query.athenaId}.csv`,
        }

        if (config?.stats) {
            Reflect.set(returnObj, 'statistics', await this.getQueryStatistics(query.athenaId as string))
        }

        return returnObj;
    }

    public async executeQueryAndGetDownloadSignedUrl(sql: string, config?: QueryWithResultsInS3Config): Promise<{
        url: string,
        statistics?: Statistics,
    }> {
        if (this._config.s3Client == null) {
            throw new Error('[AthenaNodeClient] S3 Client is missing, you must install @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner dependencies and fill s3Client field in configuration');
        }

        const {bucket, key, statistics} = await this.executeQueryAndGetS3Key(sql, config);
        const command = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
        });

        const returnObj = {
            url: await getSignedUrl(this._config.s3Client, command, {
                expiresIn: config?.s3LinkExpirationInSeconds ?? expiration1Day,
            })
        }

        if (statistics != null) {
            Reflect.set(returnObj, 'statistics', statistics)
        }

        return returnObj
    }

    /**
     * Cancel a AWS Athena query
     *
     * @param {string} id Execution query ID
     *
     * @returns {Promise<void>}
     *
     * @memberof AthenaNodeClient
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

        if (query.cacheInMinutes ?? 0 > 0) {
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
        } else {
            throw new Error('[AthenaNodeClient] Athena no returns query execution id. This may be a problem in AWS side.');
        }
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
    private async getQueryResults<T extends object>(query: Query<T>, nextToken?: string): Promise<T[]> {
        const input: GetQueryResultsInput = {
            NextToken: nextToken,
            QueryExecutionId: query.athenaId,
        };

        const response = await this._client.send(new GetQueryResultsCommand(input));
        const results = response.ResultSet;

        if (results == null) {
            throw new Error('[AthenaNodeClient] No query results. This may be a problem in AWS side.');
        }

        if (!query.hasColumns()) {
            query.columns = this.setColumnParsers(results);
        }

        const isFirstPage = !query.hasResults() && nextToken == null;

        query.results.push(...this.parseRows<T>(results.Rows ?? [], query.columns, isFirstPage));

        if (response.NextToken != null) {
            query.results = await this.getQueryResults<T>(query, response.NextToken);
        }

        return query.results;
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
            QueryExecutionId: executionId
        });

        const response = await this._client.send(input);
        const bytes = response?.QueryExecution?.Statistics?.DataScannedInBytes;
        const timeInSeconds = response?.QueryExecution?.Statistics?.EngineExecutionTimeInMillis ?? 0 / 1000

        return {
            dataScannedInBytes: bytes,
            executionTimeInSeconds: timeInSeconds,
        };
    }

    private parseRow<T extends object>(row: Row, columns: Column[]): T {
        const result = {} as T;
        const dataLength = row.Data?.length ?? 0;

        for (let rowDataIndex = 0; rowDataIndex < dataLength; rowDataIndex++) {
            const rowData = row.Data?.[rowDataIndex];
            const column = columns[rowDataIndex];
            const columnName = column.name;

            let value: unknown | null = null;

            if (rowData?.VarCharValue != null) {
                value = column.parse(rowData.VarCharValue);
            }

            Reflect.set(result, columnName, value);
        }

        return result;
    }

    private parseRows<T extends object>(rows: Row[], columns: Column[], isFirstPage = false): T[] {
        const results: T[] = [];

        // Start with 1 when first line is column title (in first page)
        for (let rowIndex = (isFirstPage) ? 1 : 0, len = rows.length; rowIndex < len; rowIndex++) {
            const row = rows[rowIndex];

            results.push(this.parseRow(row, columns));
        }

        return results;
    }

    private setColumnParsers(results: ResultSet): Column[] {
        return results.ResultSetMetadata?.ColumnInfo?.map((columnInfo, index) => {
            const name = columnInfo.Name ?? `column_${index}`;
            let parse: ColumnParse;

            switch (columnInfo.Type as AthenaDataTypeEnum) {
                case AthenaDataTypeEnum.Integer:
                case AthenaDataTypeEnum.TinyInt:
                case AthenaDataTypeEnum.SmallInt:
                case AthenaDataTypeEnum.BigInt:
                case AthenaDataTypeEnum.Float:
                case AthenaDataTypeEnum.Double:
                case AthenaDataTypeEnum.Decimal:
                    parse = Column.parseNumber;
                    break;

                case AthenaDataTypeEnum.Char:
                case AthenaDataTypeEnum.Varchar:
                case AthenaDataTypeEnum.String:
                    parse = Column.parseString;
                    break;

                case AthenaDataTypeEnum.Boolean:
                    parse = Column.parseBoolean;
                    break;

                case AthenaDataTypeEnum.Date:
                case AthenaDataTypeEnum.Timestamp:
                case AthenaDataTypeEnum.TimestampWithTz:
                    parse = Column.parseDate;
                    break;

                case AthenaDataTypeEnum.Array:
                    parse = Column.parseArray;
                    break;
                case AthenaDataTypeEnum.Json:
                    parse = Column.parseJson;
                    break;
                case AthenaDataTypeEnum.Binary:
                case AthenaDataTypeEnum.Map:
                case AthenaDataTypeEnum.Struct:
                default:
                    throw new Error(`Column type '${columnInfo.Type}' not supported`);
            }

            return new Column(name, parse);
        }) ?? [];
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

        for await (const _ of setInterval(waitTime)) {
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
}
