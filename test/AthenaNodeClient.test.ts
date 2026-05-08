import {
    GetQueryExecutionCommand,
    GetQueryResultsCommand,
    StartQueryExecutionCommand,
    type AthenaClient as AwsAthenaClient,
} from '@aws-sdk/client-athena';
import {describe, expect, test, vi} from 'vitest';

import {AthenaNodeClient} from '../src/index.js';
import {createResultSetFixture} from './helpers/athenaResultSet.js';

function getQueueSize(client: AthenaNodeClient): number {
    return (client as unknown as {_queue: {queries: unknown[]}})._queue.queries.length;
}

describe('AthenaNodeClient', () => {
    test('executeQuery parses paginated Athena results without changing the response shape', async () => {
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
                {
                    name: 'active',
                    type: 'boolean',
                    values: ['true'],
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
                {
                    name: 'active',
                    type: 'boolean',
                    values: ['false'],
                },
            ],
        });

        const send = vi.fn(async (command: unknown) => {
            if (command instanceof StartQueryExecutionCommand) {
                return {QueryExecutionId: 'athena-query-1'};
            }

            if (command instanceof GetQueryExecutionCommand) {
                return {
                    QueryExecution: {
                        ResultConfiguration: {
                            OutputLocation: 's3://athena-results/',
                        },
                        Status: {
                            State: 'SUCCEEDED',
                        },
                    },
                };
            }

            if (command instanceof GetQueryResultsCommand) {
                return command.input.NextToken == null
                    ? {
                          ResultSet: firstPage,
                          NextToken: 'page-2',
                      }
                    : {
                          ResultSet: secondPage,
                      };
            }

            throw new Error(`Unexpected command: ${String(command)}`);
        });
        const client = {send} as unknown as AwsAthenaClient;
        const athenaNodeClient = new AthenaNodeClient(client, {
            bucketUri: 's3://athena-results/',
            database: 'default',
            waitTimeInSeconds: 0.001,
        });

        const response = await athenaNodeClient.executeQuery<{
            id: number;
            name: string;
            active: boolean;
        }>('SELECT 1');

        expect(response).toEqual({
            id: 'athena-query-1',
            results: [
                {id: 1, name: 'Alice', active: true},
                {id: 2, name: 'Bob', active: false},
            ],
        });
        expect(send).toHaveBeenCalledTimes(4);
        expect(getQueueSize(athenaNodeClient)).toBe(0);
    });

    test('executeQueryStream yields rows without retaining the full result set in the queue', async () => {
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
                {
                    name: 'active',
                    type: 'boolean',
                    values: ['true'],
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
                {
                    name: 'active',
                    type: 'boolean',
                    values: ['false'],
                },
            ],
        });

        const send = vi.fn(async (command: unknown) => {
            if (command instanceof StartQueryExecutionCommand) {
                return {QueryExecutionId: 'athena-query-2'};
            }

            if (command instanceof GetQueryExecutionCommand) {
                return {
                    QueryExecution: {
                        Statistics: {
                            DataScannedInBytes: 128,
                            EngineExecutionTimeInMillis: 250,
                        },
                        ResultConfiguration: {
                            OutputLocation: 's3://athena-results/',
                        },
                        Status: {
                            State: 'SUCCEEDED',
                        },
                    },
                };
            }

            if (command instanceof GetQueryResultsCommand) {
                return command.input.NextToken == null
                    ? {
                          ResultSet: firstPage,
                          NextToken: 'page-2',
                      }
                    : {
                          ResultSet: secondPage,
                      };
            }

            throw new Error(`Unexpected command: ${String(command)}`);
        });
        const client = {send} as unknown as AwsAthenaClient;
        const athenaNodeClient = new AthenaNodeClient(client, {
            bucketUri: 's3://athena-results/',
            database: 'default',
            waitTimeInSeconds: 0.001,
        });

        const response = await athenaNodeClient.executeQueryStream<{
            id: number;
            name: string;
            active: boolean;
        }>('SELECT 1', {
            stats: true,
        });
        const rows: Array<{id: number; name: string; active: boolean}> = [];

        for await (const row of response.rows) {
            rows.push(row);
        }

        expect(response.id).toBe('athena-query-2');
        expect(response.statistics).toEqual({
            dataScannedInBytes: 128,
            executionTimeInSeconds: 0.25,
        });
        expect(rows).toEqual([
            {id: 1, name: 'Alice', active: true},
            {id: 2, name: 'Bob', active: false},
        ]);
        expect(send).toHaveBeenCalledTimes(5);
        expect(getQueueSize(athenaNodeClient)).toBe(0);
    });
});
