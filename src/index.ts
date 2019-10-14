import {Athena} from 'aws-sdk';
import {AthenaClientConfig} from './AthenaClientConfig';
import {Queue} from './Queue';
import {Query} from './Query';
import {AthenaClientException} from './exception/AthenaClientException';
import {QueryCanceledException} from './exception/QueryCanceledException';
import {Column} from './Column';

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
    private readonly client: Athena;
    private readonly config: AthenaClientConfig;

    private queue: Queue;

    /**
     * Creates an instance of AthenaClient.
     *
     * @param {AthenaClientConfig} config - Config for AWS Athena
     * @memberof AthenaClient
     */
    public constructor(config: AthenaClientConfig) {
        this.config = config;
        this.config.awsConfig.apiVersion = '2017-05-18';

        this.client = new Athena(this.config.awsConfig);
        this.queue = new Queue();
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
    public async executeQuery<T>(sql: string, parameters?: Object, id?: string): Promise<T[]> {
        const query = await this.executeQueryCommon(sql, parameters, id);

        return await this.getQueryResults(query);
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
        const query = this.queue.getQueryById(id);
        const requestParams: Athena.Types.StopQueryExecutionInput = {
            QueryExecutionId: query.athenaId,
        };

        return new Promise<void>((resolve, reject) => {
            this.client.stopQueryExecution(requestParams, (err, data) => {
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
        if (this.config.workGroup == null || this.config.workGroup === '') {
            throw new Error('You must define an AWS Athena WorkGroup');
        }

        const parameters: Athena.GetWorkGroupInput = {
            WorkGroup: this.config.workGroup,
        };

        return new Promise<Athena.WorkGroup>((resolve: Function, reject: Function) => {
            this.client.getWorkGroup(parameters, ((err: Error, data: Athena.GetWorkGroupOutput) => {
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

        if (this.config.bucketUri != null && this.config.bucketUri !== '') {
            bucket = this.config.bucketUri;
        } else if (this.config.workGroup != null || this.config.workGroup !== '') {
            const workGroup = await this.getWorkGroupDetails();

            bucket = workGroup.Configuration.ResultConfiguration.OutputLocation;
        } else {
            throw new Error('You must define a S3 Bucket URI and/or a WorkGroup');
        }

        return bucket;
    }

    private async executeQueryCommon(sql: string, parameters?: Object, id?: string): Promise<Query> {
        const query = new Query(sql, parameters, id);

        this.queue.addQuery(query);

        query.athenaId = await this.startQueryExecution(query);

        try {
            await this.waitUntilSucceedQuery(query);
        } catch (exception) {
            this.queue.removeQuery(query);

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
    private async startQueryExecution(query: Query): Promise<string> {
        const requestParams: Athena.Types.StartQueryExecutionInput = {
            QueryExecutionContext: {
                Database: this.config.database,
            },
            QueryString: query.sql,
            ResultConfiguration: {
                OutputLocation: this.config.bucketUri,
            },
        };

        if (this.config.workGroup != null) {
            requestParams.WorkGroup = this.config.workGroup;
        }

        return new Promise<string>((resolve, reject) => {
            this.client.startQueryExecution(requestParams, (err, data) => {
                if (err != null) {
                    return reject(err);
                }

                return resolve(data.QueryExecutionId);
            });
        });
    }

    /**
     * Processes query results and parses them
     *
     * @private
     * @template T
     *
     * @param {string} queryExecutionId - query execution identifier
     * @param {string} nextToken
     * @param {T[]} previousResults
     *
     * @returns {Promise<T[]>} - parsed query result rows
     * @memberof AthenaClient
     */
    private getQueryResults<T>(query: Query<T>, nextToken?: string, previousResults?: T[]): Promise<T[]> {
        const requestParams: Athena.Types.GetQueryResultsInput = {
            NextToken: nextToken,
            QueryExecutionId: query.athenaId,
        };

        return new Promise<T[]>((resolve, reject) => {
            this.client.getQueryResults(requestParams, async (err, data) => {
                if (err != null) {
                    return reject(err);
                }

                if (!query.hasColumns()) {
                    query.columns = this.setColumnParsers(data);
                }

                const isFirstPage = !query.hasResults() && nextToken == null;

                query.results = query.results.concat(this.parseRows<T>(data.ResultSet.Rows, query.columns, isFirstPage));

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
    private parseRows<T>(rows: Athena.Row[], columns: Column[], isFirstPage = false): T[] {
        const results: T[] = [];

        // Start with 1 when first line is column title (in first page)
        for (let rowIndex = (isFirstPage) ? 1 : 0; rowIndex < rows.length; rowIndex++) {
            const row = rows[rowIndex];
            const result: T = <T>{};

            for (let rowDataIndex = 0; rowDataIndex < row.Data.length; rowDataIndex++) {
                const rowData = row.Data[rowDataIndex];
                const column = columns[rowDataIndex];

                if (rowData != null && rowData.VarCharValue != null) {
                    result[column.name] = column.parse(rowData.VarCharValue);
                } else {
                    result[column.name] = null;
                }
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
    private setColumnParsers(data): Column[] {
        const columns: Column[] = [];

        for (const columnInfo of data.ResultSet.ResultSetMetadata.ColumnInfo) {
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
    private async waitUntilSucceedQuery(query: Query): Promise<void> {
        const requestParams: Athena.Types.GetQueryExecutionInput = {
            QueryExecutionId: query.athenaId,
        };

        const waitTime = this.config.waitTime * 1000;

        return new Promise<void>((resolve, reject) => {
            const interval = setInterval(() => {
                this.client.getQueryExecution(requestParams, (err, data) => {
                    if (err != null) {
                        return reject(err);
                    }

                    query.status = data.QueryExecution.Status.State;

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
                            errored(new AthenaClientException(`Query Status '${data.QueryExecution.Status.State}' not supported`));
                            break;
                    }
                });
            }, waitTime);

            const succeeded = () => {
                clearInterval(interval);
                resolve();
            };

            const errored = (err) => {
                clearInterval(interval);
                reject(err);
            };
        });
    }
}
