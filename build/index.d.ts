import { AthenaClientConfig } from './AthenaClientConfig';
export declare class AthenaClient {
    private readonly client;
    private readonly config;
    constructor(config: AthenaClientConfig);
    executeQuery<T>(query: string, parameters: Object): Promise<T[]>;
    private startQueryExecution;
    private getQueryResults;
    private parseRows;
    private setColumnParsers;
    private waitUntilSucceedQuery;
}
