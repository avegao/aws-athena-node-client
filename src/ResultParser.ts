import { type ResultSet, type Row } from '@aws-sdk/client-athena';
import { Column, type ColumnParse } from './Column.js';

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

type RowResult = Record<string, unknown>;

export class ResultObjectParser {
    public readonly columns: Column[];

    private readonly _columnNames: string[];
    private readonly _columnParsers: ColumnParse[];

    public constructor(resultSet: ResultSet) {
        this.columns = this.setColumnParsers(resultSet);
        this._columnNames = new Array(this.columns.length);
        this._columnParsers = new Array(this.columns.length);

        for (let index = 0; index < this.columns.length; index++) {
            const column = this.columns[index] as Column;

            this._columnNames[index] = column.name;
            this._columnParsers[index] = column.parse;
        }
    }

    public appendRows<T extends object>(
        target: T[],
        rows: Row[],
        isFirstPage = false,
    ): T[] {
        for (
            let rowIndex = isFirstPage ? 1 : 0, resultIndex = target.length;
            rowIndex < rows.length;
            rowIndex++, resultIndex++
        ) {
            target[resultIndex] = this.parseRow(rows[rowIndex] as Row);
        }

        return target;
    }

    public *iterateRows<T extends object>(
        rows: Row[],
        isFirstPage = false,
    ): Generator<T> {
        for (
            let rowIndex = isFirstPage ? 1 : 0;
            rowIndex < rows.length;
            rowIndex++
        ) {
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
                value == null
                    ? null
                    : (this._columnParsers[rowDataIndex] as ColumnParse)(value);
        }

        return result as T;
    }

    private setColumnParsers(results: ResultSet): Column[] {
        return (
            results.ResultSetMetadata?.ColumnInfo?.map((columnInfo, index) => {
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
                        throw new Error(
                            `Column type '${columnInfo.Type}' not supported`,
                        );
                }

                return new Column(name, parse);
            }) ?? []
        );
    }
}
