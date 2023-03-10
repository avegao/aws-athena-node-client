import {Athena, S3} from 'aws-sdk';
import {AthenaClientConfig} from './AthenaClientConfig';
import {Queue} from './Queue';
import {Query} from './Query';
import {AthenaClientException} from './exception/AthenaClientException';
import {QueryCanceledException} from './exception/QueryCanceledException';
import {Column} from './Column';
import s3urls from '@mapbox/s3urls';
import {GetQueryResultsOutput} from 'aws-sdk/clients/athena';

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

/**
 * AthenaClient class
 *
 * @export
 * @class AthenaClient
 */
export class AthenaClient {
    private readonly _client: Athena;
    private readonly _config: AthenaClientConfig;

    private _queue: Queue;

    /**
     * Creates an instance of AthenaClient.
     *
     * @param {AthenaClientConfig} config - Config for AWS Athena
     * @memberof AthenaClient
     */
    public constructor(config: AthenaClientConfig) {
        this._config = config;
        this._client = new Athena();
        this._queue = new Queue();
    }

    /**
     * Execute query in Athena
     *
     * @template T
     *
     * @param {string} sql - query to execute, as string
     * @param {Object} parameters - parameters for query
     * @param {string} id - Your custom ID
     *
     * @returns {Promise<T[]>} - parsed query results
     *
     * @memberof AthenaClient
     */
    public async executeQuery<T extends Object>(sql: string, parameters?: Object, id?: string): Promise<T[]> {
        const query = await this.executeQueryCommon<T>(sql, parameters, id);

        return this.getQueryResults<T>(query);
    }

    /**
     * Execute query in Athena and get S3 URL with CSV file
     *
     * @param {string} sql - query to execute, as string
     * @param {Object} parameters - parameters for query
     * @param {string} id - Your custom ID
     *
     * @returns {Promise<string>} - S3 URL
     *
     * @memberof AthenaClient
     */
    public async executeQueryAndGetS3Url(sql: string, parameters?: Object, id?: string): Promise<string> {
        const query = await this.executeQueryCommon(sql, parameters, id);
        const s3BucketUri = await this.getOutputS3Bucket();

        return `${s3BucketUri}${query.athenaId}.csv`;
    }

    public async executeQueryAndGetDownloadSignedUrl(sql: string, parameters?: Object, id?: string, expiration = expiration1Day): Promise<string> {
        const s3Url = await this.executeQueryAndGetS3Url(sql, parameters, id);
        const s3Object = s3urls.fromUrl(s3Url);

        const s3 = new S3();

        return s3.getSignedUrl('getObject', {
            Bucket: s3Object.Bucket,
            Expires: expiration,
            Key: s3Object.Key,
        });
    }

    /**
     * Cancel a AWS Athena query
     *
     * @param {string} id Your custom ID
     *
     * @returns {Promise<void>}
     *
     * @memberof AthenaClient
     */
    public async cancelQuery(id: string): Promise<void> {
        const query = this._queue.getQueryById(id);
        const requestParams: Athena.Types.StopQueryExecutionInput = {
            QueryExecutionId: query.athenaId,
        };

        return new Promise<void>((resolve, reject) => {
            this._client.stopQueryExecution(requestParams, (err, data) => {
                if (err != null) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Get WorkGroup details
     *
     * @returns {Promise<Athena.WorkGroup>} AWS WorkGroup Object
     */
    public async getWorkGroupDetails(): Promise<Athena.WorkGroup> {
        if (this._config.workGroup == null || this._config.workGroup === '') {
            throw new Error('You must define an AWS Athena WorkGroup');
        }

        const parameters: Athena.GetWorkGroupInput = {
            WorkGroup: this._config.workGroup,
        };

        return new Promise<Athena.WorkGroup>((resolve: Function, reject: Function) => {
            this._client.getWorkGroup(parameters, ((err: Error, data: Athena.GetWorkGroupOutput) => {
                if (err != null) {
                    return reject(err);
                }

                return resolve(data.WorkGroup);
            }));
        });
    }

    /**
     * Get output S3 bucket from bucketUri config parameter or from WorkGroup
     *
     * @returns {Promise<string>} S3 Bucket URI
     */
    public async getOutputS3Bucket(): Promise<string> {
        let bucket: string;

        if (this._config.bucketUri != null && this._config.bucketUri !== '') {
            bucket = this._config.bucketUri;
        } else if (this._config.workGroup != null || this._config.workGroup !== '') {
            const workGroup = await this.getWorkGroupDetails();

            bucket = workGroup.Configuration?.ResultConfiguration?.OutputLocation ?? '';
        } else {
            throw new Error('You must define a S3 Bucket URI and/or a WorkGroup');
        }

        return bucket;
    }

    private async executeQueryCommon<T>(sql: string, parameters?: Object, id?: string): Promise<Query<T>> {
        const query = new Query<T>(sql, parameters, id);

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
     * @memberof AthenaClient
     */
    private async startQueryExecution(query: Query<unknown>): Promise<string> {
        const requestParams: Athena.Types.StartQueryExecutionInput = {
            QueryExecutionContext: {
                Database: this._config.database,
            },
            QueryString: query.sql,
            ResultConfiguration: {
                OutputLocation: this._config.bucketUri,
            },
        };

        if (this._config.workGroup != null) {
            requestParams.WorkGroup = this._config.workGroup;
        }

        return new Promise<string>((resolve, reject) => {
            this._client.startQueryExecution(requestParams, (err, data) => {
                if (err != null) {
                    return reject(err);
                }

                return resolve(data.QueryExecutionId ?? '');
            });
        });
    }

    /**
     * Processes query results and parses them
     *
     * @private
     * @template T
     *
     * @param {Query<T>} query
     * @param {string} nextToken
     * @param {T[]} previousResults
     *
     * @returns {Promise<T[]>} - parsed query result rows
     * @memberof AthenaClient
     */
    private getQueryResults<T extends Object>(query: Query<T>, nextToken?: string, previousResults?: T[]): Promise<T[]> {
        const requestParams: Athena.Types.GetQueryResultsInput = {
            NextToken: nextToken,
            QueryExecutionId: query.athenaId,
        };

        return new Promise<T[]>((resolve, reject) => {
            this._client.getQueryResults(requestParams, async (err, data) => {
                if (err != null) {
                    return reject(err);
                }

                if (!query.hasColumns()) {
                    query.columns = this.setColumnParsers(data);
                }

                const isFirstPage = !query.hasResults() && nextToken == null;

                query.results.push(...this.parseRows<T>(data.ResultSet?.Rows ?? [], query.columns, isFirstPage));

                if (data.NextToken != null) {
                    query.results = await this.getQueryResults<T>(query, data.NextToken);
                }

                resolve(query.results);
            });
        });
    }

    /**
     * Parses result rows
     *
     * @private
     * @template T
     * @param {Athena.Row[]} rows - query result rows
     * @param {Column[]} columns - query result columns
     * @param {boolean} isFirstPage
     * @returns {T[]} - parsed result according to needed parser
     * @memberof AthenaClient
     */
    private parseRows<T extends Object>(rows: Athena.Row[], columns: Column[], isFirstPage = false): T[] {
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

    /**
     * Set appropriate column parsers according to columns' data type
     *
     * @private
     * @param {*} data - query results
     * @returns {Column[]} - column name and parser type
     * @memberof AthenaClient
     */
    private setColumnParsers(data: GetQueryResultsOutput): Column[] {
        const columns: Column[] = [];

        for (const columnInfo of data.ResultSet?.ResultSetMetadata?.ColumnInfo ?? []) {
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

            columns.push(column);
        }

        return columns;
    }

    /**
     * Checks the query execution status until the query sends SUCCEEDED signal
     *
     * @private
     * @param {Query} query - the query
     * @returns {Promise<void>} - promise that will resolve once the operation has finished
     * @memberof AthenaClient
     */
    private async waitUntilSucceedQuery(query: Query<unknown>): Promise<void> {
        const requestParams: Athena.Types.GetQueryExecutionInput = {
            QueryExecutionId: query.athenaId,
        };

        const waitTime = this._config.waitTime * 1000;

        return new Promise<void>((resolve, reject) => {
            const interval = setInterval(() => {
                this._client.getQueryExecution(requestParams, (err, data) => {
                    if (err != null) {
                        return reject(err);
                    }

                    query.status = data?.QueryExecution?.Status?.State ?? 'undefined';

                    switch (query.status) {
                        case 'SUCCEEDED':
                            succeeded();
                            break;
                        case 'QUEUED':
                        case 'RUNNING':
                            break;
                        case 'CANCELLED':
                            errored(new QueryCanceledException());
                            break;
                        case 'FAILED':
                            errored(new AthenaClientException('Query failed'));
                            break;
                        default:
                            errored(new AthenaClientException(`Query Status '${query.status}' not supported`));
                            break;
                    }
                });
            }, waitTime);

            const succeeded = (): void => {
                clearInterval(interval);

                resolve();
            };

            const errored = (err: Error): void => {
                clearInterval(interval);

                reject(err);
            };
        });
    }
}
