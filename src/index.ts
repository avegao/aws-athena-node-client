'use strict';

import {Athena} from 'aws-sdk';
import {AthenaClientConfig} from './AthenaClientConfig';
import {Queue} from './Queue';
import {Query} from './Query';
import {AthenaClientException} from './exception/AthenaClientException';
import {QueryCanceledException} from './exception/QueryCanceledException';

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

        return await this.getQueryResults(query.athenaId);
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
    private getQueryResults<T>(queryExecutionId: string, nextToken?: string, previousResults?: T[]): Promise<T[]> {
        const requestParams: Athena.Types.GetQueryResultsInput = {
            NextToken: nextToken,
            QueryExecutionId: queryExecutionId,
        };

        let columns: AthenaColumn[];

        return new Promise<any>((resolve, reject) => {
            this.client.getQueryResults(requestParams, async (err, data) => {
                if (err != null) {
                    return reject(err);
                }

                columns = this.setColumnParsers(data);

                const isFirstPage = (previousResults == null && nextToken == null);

                let results = this.parseRows<T>(data.ResultSet.Rows, columns, isFirstPage);

                if (previousResults != null) {
                    results = previousResults.concat(results);
                }

                if (data.NextToken != null) {
                    results = await this.getQueryResults<T>(queryExecutionId, data.NextToken, results);
                }

                resolve(results);
            });
        });
    }

    /**
     * Parses result rows
     *
     * @private
     * @template T
     * @param {Athena.Row[]} rows - query result rows
     * @param {AthenaColumn[]} columns - query result columns
     * @param {boolean} isFirstPage
     * @returns {T[]} - parsed result according to needed parser
     * @memberof AthenaClient
     */
    private parseRows<T>(rows: Athena.Row[], columns: AthenaColumn[], isFirstPage = false): T[] {
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
     * @returns {AthenaColumn[]} - column name and parser type
     * @memberof AthenaClient
     */
    private setColumnParsers(data): AthenaColumn[] {
        const columns: AthenaColumn[] = [];

        for (const columnInfo of data.ResultSet.ResultSetMetadata.ColumnInfo) {
            const column = new AthenaColumn();
            column.name = columnInfo.Name;

            switch (columnInfo.Type as AthenaDataTypeEnum) {
                case AthenaDataTypeEnum.Integer:
                case AthenaDataTypeEnum.TinyInt:
                case AthenaDataTypeEnum.SmallInt:
                case AthenaDataTypeEnum.BigInt:
                case AthenaDataTypeEnum.Float:
                case AthenaDataTypeEnum.Double:
                case AthenaDataTypeEnum.Decimal:
                    column.parse = AthenaColumn.parseNumber;
                    break;

                case AthenaDataTypeEnum.Char:
                case AthenaDataTypeEnum.Varchar:
                    column.parse = AthenaColumn.parseString;
                    break;

                case AthenaDataTypeEnum.Boolean:
                    column.parse = AthenaColumn.parseBoolean;
                    break;

                case AthenaDataTypeEnum.Date:
                case AthenaDataTypeEnum.Timestamp:
                case AthenaDataTypeEnum.TimestampWithTz:
                    column.parse = AthenaColumn.parseDate;
                    break;

                case AthenaDataTypeEnum.Array:
                    column.parse = AthenaColumn.parseArray;
                    break;
                case AthenaDataTypeEnum.Json:
                    column.parse = AthenaColumn.parseJson;
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

        return new Promise<void>((resolve, reject) => {
            this.client.getQueryExecution(requestParams, async (err, data) => {
                if (err != null) {
                    return reject(err);
                }

                query.status = data.QueryExecution.Status.State;

                switch (query.status) {
                    case 'SUCCEEDED':
                        resolve();

                        break;
                    case 'QUEUED':
                    case 'RUNNING':
                        setTimeout(async () => {
                            try {
                                await this.waitUntilSucceedQuery(query);
                                resolve();
                            } catch (e) {
                                reject(e);
                            }
                        }, this.config.waitTime * 1000);

                        break;

                    case 'CANCELLED':
                        reject(new QueryCanceledException());

                        break;
                    case 'FAILED':
                        reject(new AthenaClientException('Query failed'));

                        break;
                    default:
                        reject(new AthenaClientException(`Query Status '${data.QueryExecution.Status.State}' not supported`));

                        break;
                }
            });
        });
    }
}

/**
 * AthenaColumn class
 *
 * @class AthenaColumn
 */
class AthenaColumn {
    public name: string;

    public parse: (value: string) => any;

    /**
     * Parses string to number
     *
     * @static
     * @param {string} value - string to parse
     * @returns {number} - parsed number
     * @memberof AthenaColumn
     */
    public static parseNumber(value: string): number {
        const result = Number(value);

        if (isNaN(result)) {
            throw new Error(`The value '${value} 'is not a number`);
        }

        return result;
    }

    /**
     * Parses string
     *
     * @static
     * @param {string} value - string to parse
     * @returns {string} - parsed string
     * @memberof AthenaColumn
     */
    public static parseString(value: string): string {
        return value;
    }

    /**
     * Parses boolean-like Athena expression to boolean
     *
     * @static
     * @param {string} value - boolean-like string
     * @returns {boolean} - parsed string
     * @memberof AthenaColumn
     */
    public static parseBoolean(value: string): boolean {
        return (
            value === 'true'
            || value === 'TRUE'
            || value === 't'
            || value === 'T'
            || value === 'yes'
            || value === 'YES'
            || value === '1'
        );
    }

    /**
     * Parses string to date
     *
     * @static
     * @param {string} value - string to parse
     * @returns {Date} - parsed date
     * @memberof AthenaColumn
     */
    public static parseDate(value: string): Date {
        return new Date(value);
    }

    /**
     * Parses string to array
     *
     * @static
     * @param {string} arrayInString - string to parse
     * @returns {any[]} - parsed array
     * @memberof AthenaColumn
     */
    public static parseArray(arrayInString: string): number[] | string[] {
        arrayInString = arrayInString.replace(/\[|\]/gi, '');
        const values = arrayInString.split(', ');
        const result: number[] | string[] = [];

        for (const value of values) {
            let numberValue = Number(value);

            if (!Number.isNaN(numberValue)) {
                result.push(<any>numberValue);
            } else {
                result.push(<any>value);
            }
        }

        return result;
    }

    /**
     * Parses string to array
     *
     * @static
     * @param {string} value - string to parse
     * @returns {any[]} - parsed array
     * @memberof AthenaColumn
     */
    public static parseJson(value: string): any[] {
        return JSON.parse(value);
    }
}
