import { Athena } from 'aws-sdk';
import { AthenaClientConfig } from './AthenaClientConfig';
/**
 * AthenaClient class
 *
 * @export
 * @class AthenaClient
 */
export declare class AthenaClient {
    private readonly client;
    private readonly config;
    private queue;
    /**
     * Creates an instance of AthenaClient.
     *
     * @param {AthenaClientConfig} config - Config for AWS Athena
     * @memberof AthenaClient
     */
    constructor(config: AthenaClientConfig);
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
    executeQuery<T>(sql: string, parameters?: Object, id?: string): Promise<T[]>;
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
    executeQueryAndGetS3Url(sql: string, parameters?: Object, id?: string): Promise<string>;
    /**
     * Cancel a AWS Athena query
     *
     * @param {string} id Your custom ID
     *
     * @returns {Promise<void>}
     *
     * @memberof AthenaClient
     */
    cancelQuery(id: string): Promise<void>;
    /**
     * Get WorkGroup details
     *
     * @returns {Promise<Athena.WorkGroup>} AWS WorkGroup Object
     */
    getWorkGroupDetails(): Promise<Athena.WorkGroup>;
    /**
     * Get output S3 bucket from bucketUri config parameter or from WorkGroup
     *
     * @returns {Promise<string>} S3 Bucket URI
     */
    getOutputS3Bucket(): Promise<string>;
    private executeQueryCommon;
    /**
     * Starts query execution and gets an ID for the operation
     *
     * @private
     * @param {Query} query - Athena request params
     * @returns {Promise<string>} - query execution id
     * @memberof AthenaClient
     */
    private startQueryExecution;
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
    private getQueryResults;
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
    private parseRows;
    /**
     * Set appropriate column parsers according to columns' data type
     *
     * @private
     * @param {*} data - query results
     * @returns {AthenaColumn[]} - column name and parser type
     * @memberof AthenaClient
     */
    private setColumnParsers;
    /**
     * Checks the query execution status until the query sends SUCCEEDED signal
     *
     * @private
     * @param {Query} query - the query
     * @returns {Promise<void>} - promise that will resolve once the operation has finished
     * @memberof AthenaClient
     */
    private waitUntilSucceedQuery;
}
