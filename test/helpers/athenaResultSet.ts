import { type ResultSet, type Row } from '@aws-sdk/client-athena';

export interface ResultSetColumnFixture {
    readonly name: string;
    readonly type: string;
    readonly values?: readonly (string | null)[];
    readonly valueFactory?: (rowIndex: number) => string | null;
}

export interface ResultSetFixtureOptions {
    readonly columns: readonly ResultSetColumnFixture[];
    readonly rowCount?: number;
    readonly includeHeaderRow?: boolean;
}

export function createResultSetFixture(
    options: ResultSetFixtureOptions,
): ResultSet {
    const { columns, rowCount: explicitRowCount, includeHeaderRow = true } =
        options;
    const rowCount = explicitRowCount ?? columns[0]?.values?.length ?? 0;
    const rows: Row[] = [];

    if (includeHeaderRow) {
        rows.push({
            Data: columns.map(({ name }) => ({ VarCharValue: name })),
        });
    }

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
        const data = new Array(columns.length);

        for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
            const column = columns[columnIndex] as ResultSetColumnFixture;
            const value =
                column.values?.[rowIndex] ?? column.valueFactory?.(rowIndex) ?? null;

            data[columnIndex] = value == null ? {} : { VarCharValue: value };
        }

        rows.push({ Data: data });
    }

    return {
        ResultSetMetadata: {
            ColumnInfo: columns.map(({ name, type }) => ({
                Name: name,
                Type: type,
            })),
        },
        Rows: rows,
    };
}

export function createRepresentativeResultSet(rowCount = 7000): ResultSet {
    return createResultSetFixture({
        rowCount,
        columns: [
            {
                name: 'id',
                type: 'integer',
                valueFactory: (rowIndex) => String(rowIndex + 1),
            },
            {
                name: 'accountId',
                type: 'bigint',
                valueFactory: (rowIndex) => String(100_000 + rowIndex),
            },
            {
                name: 'amount',
                type: 'decimal',
                valueFactory: (rowIndex) => `${rowIndex % 500}.${rowIndex % 100}`,
            },
            {
                name: 'ratio',
                type: 'double',
                valueFactory: (rowIndex) => `${(rowIndex % 10) / 10}`,
            },
            {
                name: 'isActive',
                type: 'boolean',
                valueFactory: (rowIndex) => (rowIndex % 2 === 0 ? 'true' : 'false'),
            },
            {
                name: 'createdAt',
                type: 'timestamp',
                valueFactory: (rowIndex) =>
                    `2026-05-${String((rowIndex % 28) + 1).padStart(2, '0')}T12:34:56.000Z`,
            },
            {
                name: 'tags',
                type: 'array',
                valueFactory: (rowIndex) =>
                    `[${rowIndex % 3}, ${(rowIndex + 1) % 5}, ${(rowIndex + 2) % 7}]`,
            },
            {
                name: 'metadata',
                type: 'json',
                valueFactory: (rowIndex) =>
                    `{"bucket":${rowIndex % 10},"enabled":${rowIndex % 2 === 0}}`,
            },
            {
                name: 'name',
                type: 'varchar',
                valueFactory: (rowIndex) => `user-${rowIndex}`,
            },
            {
                name: 'segment',
                type: 'string',
                valueFactory: (rowIndex) =>
                    rowIndex % 3 === 0 ? 'enterprise' : 'standard',
            },
        ],
    });
}
