import { AthenaClientConfig } from './AthenaClientConfig';
export declare class AthenaClient {
    private readonly client;
    private readonly config;
    private queue;
    constructor(config: AthenaClientConfig);
    executeQuery<T>(sql: string, parameters?: Object, id?: string): Promise<T[]>;
    cancelQuery(id: string): Promise<void>;
    private startQueryExecution;
    private getQueryResults;
    private parseRows;
    private setColumnParsers;
    private waitUntilSucceedQuery;
}
