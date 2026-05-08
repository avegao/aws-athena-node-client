import type {ResultSet, Row} from '@aws-sdk/client-athena';

import {Column} from './Column.js';
import type {ColumnParse} from './Column.js';

const ATHENA_DATA_TYPES = {
    INTEGER: 'integer',
    FLOAT: 'float',
    DOUBLE: 'double',
    DECIMAL: 'decimal',
    CHAR: 'char',
    VARCHAR: 'varchar',
    BOOLEAN: 'boolean',
    BINARY: 'binary',
    DATE: 'date',
    TIMESTAMP: 'timestamp',
    TIMESTAMP_WITH_TZ: 'timestamp with time zone',
    ARRAY: 'array',
    JSON: 'json',
    MAP: 'map',
    STRING: 'string',
    STRUCT: 'struct',
    TINY_INT: 'tinyint',
    SMALL_INT: 'smallint',
    BIG_INT: 'bigint',
} as const;

type AthenaDataType = (typeof ATHENA_DATA_TYPES)[keyof typeof ATHENA_DATA_TYPES];

type RowResult = Record<string, unknown>;

export class ResultObjectParser {
    public readonly columns: Column[];

    private readonly _columnNames: string[];
    private readonly _columnParsers: ColumnParse[];

    public constructor(resultSet: ResultSet) {
        this.columns = this.setColumnParsers(resultSet);
        this._columnNames = Array(this.columns.length);
        this._columnParsers = Array(this.columns.length);

        for (let index = 0; index < this.columns.length; index++) {
            const column = this.columns[index] as Column;

            this._columnNames[index] = column.name;
            this._columnParsers[index] = column.parse;
        }
    }

    public appendRows<T extends object>(target: T[], rows: Row[], isFirstPage = false): T[] {
        for (
            let rowIndex = isFirstPage ? 1 : 0, resultIndex = target.length;
            rowIndex < rows.length;
            rowIndex++, resultIndex++
        ) {
            target[resultIndex] = this.parseRow(rows[rowIndex] as Row);
        }

        return target;
    }

    public *iterateRows<T extends object>(rows: Row[], isFirstPage = false): Generator<T> {
        for (let rowIndex = isFirstPage ? 1 : 0; rowIndex < rows.length; rowIndex++) {
            yield this.parseRow(rows[rowIndex] as Row);
        }
    }

    public parseRow<T extends object>(row: Row): T {
        const result: RowResult = {};
        const data = row.Data;

        if (data == null) {
            return result as T;
        }

        for (let rowDataIndex = 0; rowDataIndex < data.length; rowDataIndex++) {
            const rowData = data[rowDataIndex];
            const value = rowData?.VarCharValue;

            result[this._columnNames[rowDataIndex] as string] =
                value == null ? null : (this._columnParsers[rowDataIndex] as ColumnParse)(value);
        }

        return result as T;
    }

    private setColumnParsers(results: ResultSet): Column[] {
        return (
            results.ResultSetMetadata?.ColumnInfo?.map((columnInfo, index) => {
                const name = columnInfo.Name ?? `column_${index}`;
                let parse: ColumnParse;

                switch (columnInfo.Type as AthenaDataType) {
                    case ATHENA_DATA_TYPES.INTEGER:
                    case ATHENA_DATA_TYPES.TINY_INT:
                    case ATHENA_DATA_TYPES.SMALL_INT:
                    case ATHENA_DATA_TYPES.BIG_INT:
                    case ATHENA_DATA_TYPES.FLOAT:
                    case ATHENA_DATA_TYPES.DOUBLE:
                    case ATHENA_DATA_TYPES.DECIMAL:
                        parse = Column.parseNumber;
                        break;

                    case ATHENA_DATA_TYPES.CHAR:
                    case ATHENA_DATA_TYPES.VARCHAR:
                    case ATHENA_DATA_TYPES.STRING:
                        parse = Column.parseString;
                        break;

                    case ATHENA_DATA_TYPES.BOOLEAN:
                        parse = Column.parseBoolean;
                        break;

                    case ATHENA_DATA_TYPES.DATE:
                    case ATHENA_DATA_TYPES.TIMESTAMP:
                    case ATHENA_DATA_TYPES.TIMESTAMP_WITH_TZ:
                        parse = Column.parseDate;
                        break;

                    case ATHENA_DATA_TYPES.ARRAY:
                        parse = Column.parseArray;
                        break;

                    case ATHENA_DATA_TYPES.JSON:
                        parse = Column.parseJson;
                        break;

                    case ATHENA_DATA_TYPES.BINARY:
                    case ATHENA_DATA_TYPES.MAP:
                    case ATHENA_DATA_TYPES.STRUCT:
                    default:
                        throw new Error(`Column type '${columnInfo.Type}' not supported`);
                }

                return new Column(name, parse);
            }) ?? []
        );
    }
}
