'use strict';

import {Athena} from 'aws-sdk';
import {formatQuery} from 'pg-promise/lib/formatting';
import {AthenaClientConfig} from './AthenaClientConfig';

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
    }

    /**
     * Execute query in Athena
     *
     * @template T
     * @param {string} query - query to execute, as string
     * @param {Object} parameters - parameters for query
     * @returns {Promise<T[]>} - parsed query results
     * @memberof AthenaClient
     */
    public async executeQuery<T>(query: string, parameters: Object): Promise<T[]> {
        query = formatQuery(query, parameters);

        const requestParams: Athena.Types.StartQueryExecutionInput = {
            QueryExecutionContext: {
                Database: this.config.database,
            },
            QueryString: query,
            ResultConfiguration: {
                OutputLocation: this.config.bucketUri,
            },
        };

        if (this.config.workGroup != null) {
            requestParams.WorkGroup = this.config.workGroup;
        }

        const queryExecutionId = await this.startQueryExecution(requestParams);
        await this.waitUntilSucceedQuery(queryExecutionId);

        return await this.getQueryResults(queryExecutionId);
    }

    /**
     * Starts query execution and gets an ID for the operation
     *
     * @private
     * @param {Athena.Types.StartQueryExecutionInput} requestParams - Athena request params
     * @returns {Promise<string>} - query execution id
     * @memberof AthenaClient
     */
    private async startQueryExecution(requestParams: Athena.Types.StartQueryExecutionInput): Promise<string> {
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
     * @param {string} queryExecutionId - query execution identifier
     * @param {string} nextToken
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

                result[column.name] = column.parse(rowData.VarCharValue);
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
                case AthenaDataTypeEnum.Json:
                    column.parse = AthenaColumn.parseArray;
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
     * @param {string} queryExecutionId - the query execution identifier
     * @returns {Promise<void>} - promise that will resolve once the operation has finished
     * @memberof AthenaClient
     */
    private async waitUntilSucceedQuery(queryExecutionId: string): Promise<void> {
        const requestParams: Athena.Types.GetQueryExecutionInput = {
            QueryExecutionId: queryExecutionId,
        };

        return new Promise<void>((resolve, reject) => {
            this.client.getQueryExecution(requestParams, async (err, data) => {
                if (err != null) {
                    return reject(err);
                }

                switch (data.QueryExecution.Status.State) {
                    case 'SUCCEEDED':
                        resolve();

                        break;
                    case 'QUEUED':
                    case 'RUNNING':
                        setTimeout(async () => {
                            try {
                                await this.waitUntilSucceedQuery(queryExecutionId);
                                resolve();
                            } catch (e) {
                                reject(e);
                            }
                        }, this.config.waitTime * 1000);

                        break;

                    case 'CANCELLED':
                        reject(new Error(`Query cancelled`));

                        break;
                    case 'FAILED':
                        reject(new Error(`Query failed`));

                        break;
                    default:
                        reject(new Error(`Query Status '${data.QueryExecution.Status.State}' not supported`));

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
     * @param {string} value - string to parse
     * @returns {any[]} - parsed array
     * @memberof AthenaColumn
     */
    public static parseArray(value: string): any[] {
        return JSON.parse(value);
    }
}
