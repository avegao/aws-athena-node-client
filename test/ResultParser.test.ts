import {describe, expect, test} from 'vite-plus/test';

import {ResultObjectParser} from '../src/ResultParser.js';
import {createRepresentativeResultSet, createResultSetFixture} from './helpers/athenaResultSet.js';

describe('ResultObjectParser', () => {
    test('parses mixed Athena rows into typed objects', () => {
        const resultSet = createResultSetFixture({
            columns: [
                {
                    name: 'id',
                    type: 'integer',
                    values: ['1'],
                },
                {
                    name: 'name',
                    type: 'varchar',
                    values: ['Alice'],
                },
                {
                    name: 'active',
                    type: 'boolean',
                    values: ['TRUE'],
                },
                {
                    name: 'createdAt',
                    type: 'timestamp',
                    values: ['2026-05-07T10:30:00.000Z'],
                },
                {
                    name: 'tags',
                    type: 'array',
                    values: ['[1, 2, 3]'],
                },
                {
                    name: 'metadata',
                    type: 'json',
                    values: ['{"role":"admin"}'],
                },
                {
                    name: 'nickname',
                    type: 'varchar',
                    values: [null],
                },
            ],
        });
        const parser = new ResultObjectParser(resultSet);
        const results: Array<Record<string, unknown>> = [];

        parser.appendRows(results, resultSet.Rows ?? [], true);

        expect(results).toEqual([
            {
                id: 1,
                name: 'Alice',
                active: true,
                createdAt: new Date('2026-05-07T10:30:00.000Z'),
                tags: [1, 2, 3],
                metadata: {role: 'admin'},
                nickname: null,
            },
        ]);
    });

    test('appends paginated rows into the same target array', () => {
        const firstPage = createResultSetFixture({
            columns: [
                {
                    name: 'id',
                    type: 'integer',
                    values: ['1'],
                },
                {
                    name: 'name',
                    type: 'varchar',
                    values: ['Alice'],
                },
            ],
        });
        const secondPage = createResultSetFixture({
            includeHeaderRow: false,
            columns: [
                {
                    name: 'id',
                    type: 'integer',
                    values: ['2'],
                },
                {
                    name: 'name',
                    type: 'varchar',
                    values: ['Bob'],
                },
            ],
        });
        const parser = new ResultObjectParser(firstPage);
        const results: Array<Record<string, unknown>> = [];

        expect(parser.appendRows(results, firstPage.Rows ?? [], true)).toBe(results);

        parser.appendRows(results, secondPage.Rows ?? [], false);

        expect(results).toEqual([
            {id: 1, name: 'Alice'},
            {id: 2, name: 'Bob'},
        ]);
    });

    test('iterates paginated rows without materializing a temporary array', () => {
        const resultSet = createResultSetFixture({
            columns: [
                {
                    name: 'id',
                    type: 'integer',
                    values: ['1', '2'],
                },
                {
                    name: 'name',
                    type: 'varchar',
                    values: ['Alice', 'Bob'],
                },
            ],
        });
        const parser = new ResultObjectParser(resultSet);

        expect(Array.from(parser.iterateRows(resultSet.Rows ?? [], true))).toEqual([
            {id: 1, name: 'Alice'},
            {id: 2, name: 'Bob'},
        ]);
    });

    test('throws for unsupported Athena column types', () => {
        expect(
            () =>
                new ResultObjectParser(
                    createResultSetFixture({
                        columns: [
                            {
                                name: 'payload',
                                type: 'map',
                                values: ['{"a":1}'],
                            },
                        ],
                    }),
                ),
        ).toThrowError("Column type 'map' not supported");
    });

    test('keeps representative fixtures parseable', () => {
        const resultSet = createRepresentativeResultSet(10);
        const parser = new ResultObjectParser(resultSet);
        const results: Array<Record<string, unknown>> = [];

        parser.appendRows(results, resultSet.Rows ?? [], true);

        expect(results).toHaveLength(10);
        expect(results[0]).toMatchObject({
            id: 1,
            accountId: 100000,
            amount: 0,
            ratio: 0,
            isActive: true,
            name: 'user-0',
            segment: 'enterprise',
        });
    });
});
