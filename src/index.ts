import {AthenaClientConfig} from './AthenaClientConfig.js';
import {Queue} from './Queue.js';
import {Query} from './Query.js';
import {Column} from './Column.js';
import {
    AthenaClient as AwsAthenaClient,
    GetQueryExecutionCommand,
    GetQueryExecutionInput,
    GetQueryResultsCommand,
    GetQueryResultsInput,
    GetWorkGroupCommand,
    GetWorkGroupInput,
    ResultSet,
    Row,
    StartQueryExecutionCommand,
    StartQueryExecutionCommandInput,
    StopQueryExecutionCommand,
    StopQueryExecutionInput,
    WorkGroup,
} from '@aws-sdk/client-athena';
import {setInterval} from 'timers/promises';
import {AthenaClientException} from './exception/AthenaClientException.js';
import {QueryCanceledException} from './exception/QueryCanceledException.js';
import {isEmpty} from 'lodash-es';
import {GetObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';

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
}

export interface QueryWithResultsInS3Config extends QueryConfig {
    s3LinkExpirationInSeconds?: number;
}

export class Athenathor {
    private readonly _client: AwsAthenaClient;
    private readonly _config: AthenaClientConfig;

    private _queue: Queue;

    public constructor(client: AwsAthenaClient, config: AthenaClientConfig) {
        this._client = client;
        this._config = config;
        this._queue = new Queue();
    }

    public async executeQuery<T>(sql: string, config?: QueryConfig): Promise<T[]> {
        const query = await this.executeQueryCommon<T>(sql, config);

        return this.getQueryResults<T>(query);
    }

    /**
     * Execute query in Athena and get S3 URL with CSV file
     */
    public async executeQueryAndGetS3Key(sql: string, config?: QueryConfig): Promise<{bucket: string; key: string}> {
        const query = await this.executeQueryCommon(sql, config);

        const [bucket, key] = query.s3Location.replace('s3://', '').split('/', 1);

        return {
            bucket,
            key: `${key ?? ''}${query.athenaId}.csv`
        }
    }

    public async executeQueryAndGetDownloadSignedUrl(sql: string, config?: QueryWithResultsInS3Config): Promise<string> {
        if (this._config.s3Client == null) {
            throw new Error('S3 Client is missing, you must install @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner dependencies and fill s3Client field in configuration');
        }

        const {bucket, key} = await this.executeQueryAndGetS3Key(sql, config);
        const command = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
        });

        return getSignedUrl(this._config.s3Client, command, {
            expiresIn: config?.s3LinkExpirationInSeconds ?? expiration1Day,
        });
    }

    /**
     * Cancel a AWS Athena query
     *
     * @param {string} id Execution query ID
     *
     * @returns {Promise<void>}
     *
     * @memberof Athenathor
     */
    public async cancelQuery(id: string): Promise<void> {
        const query = this._queue.getQueryById(id);
        const input: StopQueryExecutionInput = {
            QueryExecutionId: query.athenaId,
        };

        await this._client.send(new StopQueryExecutionCommand(input));
    }

    /**
     * Get WorkGroup details
     *
     * @returns {Promise<WorkGroup>} AWS WorkGroup Object
     */
    public async getWorkGroupDetails(): Promise<WorkGroup> {
        if (isEmpty(this._config.workGroup)) {
            throw new Error('You must define an AWS Athena WorkGroup');
        }

        const input: GetWorkGroupInput = {
            WorkGroup: this._config.workGroup,
        };

        const response = await this._client.send(new GetWorkGroupCommand(input));

        return response.WorkGroup;
    }

    /**
     * Get output S3 bucket from bucketUri config parameter or from WorkGroup
     *
     * @returns {Promise<string>} S3 Bucket URI
     */
    public async getOutputS3Bucket(): Promise<string> {
        let bucket: string;

        if (!isEmpty(this._config.bucketUri)) {
            bucket = this._config.bucketUri;
        } else if (!isEmpty(this._config.workGroup)) {
            const workGroup = await this.getWorkGroupDetails();

            bucket = workGroup.Configuration?.ResultConfiguration?.OutputLocation ?? '';
        } else {
            throw new Error('You must define a S3 Bucket URI and/or a WorkGroup');
        }

        return bucket;
    }

    private async executeQueryCommon<T>(sql: string, config?: QueryConfig): Promise<Query<T>> {
        const query = new Query<T>(sql, config.parameters, config.id);

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
     * @memberof Athenathor
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
            ResultReuseConfiguration: {
                ResultReuseByAgeConfiguration: {
                    Enabled: true,
                    MaxAgeInMinutes: 60,
                },
            },
        };

        if (this._config.workGroup != null) {
            input.WorkGroup = this._config.workGroup;
        }

        if (query.cacheInMinutes ?? 0 > 0) {
            input.ResultReuseConfiguration = {
                ResultReuseByAgeConfiguration: {
                    Enabled: true,
                    MaxAgeInMinutes: 60,
                },
            };
        }

        const response = await this._client.send(new StartQueryExecutionCommand(input));

        return response.QueryExecutionId;
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
     * @memberof Athenathor
     */
    private async getQueryResults<T extends Object>(query: Query<T>, nextToken?: string): Promise<T[]> {
        const input: GetQueryResultsInput = {
            NextToken: nextToken,
            QueryExecutionId: query.athenaId,
        };

        const response = await this._client.send(new GetQueryResultsCommand(input));
        const results = response.ResultSet;

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

    private parseRows<T extends Object>(rows: Row[], columns: Column[], isFirstPage = false): T[] {
        const results: T[] = [];

        // Start with 1 when first line is column title (in first page)
        for (let rowIndex = (isFirstPage) ? 1 : 0, len = rows.length; rowIndex < len; rowIndex++) {
            const row = rows[rowIndex];
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

            results.push(result);
        }

        return results;
    }

    private setColumnParsers(results: ResultSet): Column[] {
        return results.ResultSetMetadata?.ColumnInfo.map((columnInfo) => {
            const column = new Column();
            column.name = columnInfo.Name;

            switch (columnInfo.Type as AthenaDataTypeEnum) {
                case AthenaDataTypeEnum.Integer:
                case AthenaDataTypeEnum.TinyInt:
                case AthenaDataTypeEnum.SmallInt:
                case AthenaDataTypeEnum.BigInt:
                case AthenaDataTypeEnum.Float:
                case AthenaDataTypeEnum.Double:
                case AthenaDataTypeEnum.Decimal:
                    column.parse = Column.parseNumber;
                    break;

                case AthenaDataTypeEnum.Char:
                case AthenaDataTypeEnum.Varchar:
                case AthenaDataTypeEnum.String:
                    column.parse = Column.parseString;
                    break;

                case AthenaDataTypeEnum.Boolean:
                    column.parse = Column.parseBoolean;
                    break;

                case AthenaDataTypeEnum.Date:
                case AthenaDataTypeEnum.Timestamp:
                case AthenaDataTypeEnum.TimestampWithTz:
                    column.parse = Column.parseDate;
                    break;

                case AthenaDataTypeEnum.Array:
                    column.parse = Column.parseArray;
                    break;
                case AthenaDataTypeEnum.Json:
                    column.parse = Column.parseJson;
                    break;
                case AthenaDataTypeEnum.Binary:
                case AthenaDataTypeEnum.Map:
                case AthenaDataTypeEnum.Struct:
                default:
                    throw new Error(`Column type '${columnInfo.Type}' not supported`);
            }

            return column;
        });
    }

    /**
     * Checks the query execution status until the query sends SUCCEEDED signal
     *
     * @private
     * @param {Query} query - the query
     * @returns {Promise<void>} - promise that will resolve once the operation has finished
     * @memberof Athenathor
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
                    query.s3Location = response.QueryExecution.ResultConfiguration.OutputLocation;

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
