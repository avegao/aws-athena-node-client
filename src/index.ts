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

export class AthenaClient {
    private readonly client: Athena;
    private readonly config: AthenaClientConfig;

    public constructor(config: AthenaClientConfig) {
        this.config = config;
        this.config.awsConfig.apiVersion = '2017-05-18';

        this.client = new Athena(this.config.awsConfig);
    }

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

    private getQueryResults<T>(queryExecutionId: string): Promise<T[]> {
        const requestParams: Athena.Types.GetQueryExecutionInput = {
            QueryExecutionId: queryExecutionId,
        };

        let columns: AthenaColumn[];

        return new Promise<any>(((resolve, reject) => {
            this.client.getQueryResults(requestParams, ((err, data) => {
                if (err != null) {
                    return reject(err);
                }

                columns = this.setColumnParsers(data);
                const results = this.parseRows(data.ResultSet.Rows, columns);

                resolve(results);
            }));
        }));
    }

    private parseRows<T>(rows: Athena.Row[], columns: AthenaColumn[]): T[] {
        const results: T[] = [];

        // Start by 1 because first line is column title
        for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
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

    private async waitUntilSucceedQuery(queryExecutionId: string): Promise<void> {
        const requestParams: Athena.Types.GetQueryExecutionInput = {
            QueryExecutionId: queryExecutionId,
        };

        return new Promise<void>((resolve, reject) => {
            this.client.getQueryExecution(requestParams, (async (err, data) => {
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
                            await this.waitUntilSucceedQuery(queryExecutionId);
                            resolve();
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
            }));
        });

    }
}

class AthenaColumn {
    public name: string;
    public parse: (value: string) => any;

    public static parseNumber(value: string): number {
        const result = Number(value);

        if (isNaN(result)) {
            throw new Error(`The value '${value} 'is not a number`);
        }

        return result;
    }

    public static parseString(value: string): string {
        return value;
    }

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

    public static parseDate(value: string): Date {
        return new Date(value);
    }

    public static parseArray(value: string): any[] {
        return JSON.parse(value);
    }
}
