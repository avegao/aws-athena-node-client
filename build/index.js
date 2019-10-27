"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const aws_sdk_1 = require("aws-sdk");
const Queue_1 = require("./Queue");
const Query_1 = require("./Query");
const AthenaClientException_1 = require("./exception/AthenaClientException");
const QueryCanceledException_1 = require("./exception/QueryCanceledException");
const Column_1 = require("./Column");
const S3 = require("aws-sdk/clients/s3");
const aws_sdk_2 = require("aws-sdk");
const s3urls = require("@mapbox/s3urls");
const expiration1Day = 60 * 60 * 24;
var AthenaDataTypeEnum;
(function (AthenaDataTypeEnum) {
    AthenaDataTypeEnum["Integer"] = "integer";
    AthenaDataTypeEnum["Float"] = "float";
    AthenaDataTypeEnum["Double"] = "double";
    AthenaDataTypeEnum["Decimal"] = "decimal";
    AthenaDataTypeEnum["Char"] = "char";
    AthenaDataTypeEnum["Varchar"] = "varchar";
    AthenaDataTypeEnum["Boolean"] = "boolean";
    AthenaDataTypeEnum["Binary"] = "binary";
    AthenaDataTypeEnum["Date"] = "date";
    AthenaDataTypeEnum["Timestamp"] = "timestamp";
    AthenaDataTypeEnum["TimestampWithTz"] = "timestamp with time zone";
    AthenaDataTypeEnum["Array"] = "array";
    AthenaDataTypeEnum["Json"] = "json";
    AthenaDataTypeEnum["Map"] = "map";
    AthenaDataTypeEnum["Struct"] = "struct";
    AthenaDataTypeEnum["TinyInt"] = "tinyint";
    AthenaDataTypeEnum["SmallInt"] = "smallint";
    AthenaDataTypeEnum["BigInt"] = "bigint";
})(AthenaDataTypeEnum || (AthenaDataTypeEnum = {}));
/**
 * AthenaClient class
 *
 * @export
 * @class AthenaClient
 */
class AthenaClient {
    /**
     * Creates an instance of AthenaClient.
     *
     * @param {AthenaClientConfig} config - Config for AWS Athena
     * @memberof AthenaClient
     */
    constructor(config) {
        this.config = config;
        this.config.awsConfig.apiVersion = '2017-05-18';
        this.client = new aws_sdk_1.Athena(this.config.awsConfig);
        this.queue = new Queue_1.Queue();
    }
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
    async executeQuery(sql, parameters, id) {
        const query = await this.executeQueryCommon(sql, parameters, id);
        return await this.getQueryResults(query);
    }
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
    async executeQueryAndGetS3Url(sql, parameters, id) {
        const query = await this.executeQueryCommon(sql, parameters, id);
        const s3BucketUri = await this.getOutputS3Bucket();
        return `${s3BucketUri}${query.athenaId}.csv`;
    }
    async executeQueryAndGetDownloadSignedUrl(sql, parameters, id, expiration = expiration1Day) {
        const s3Url = await this.executeQueryAndGetS3Url(sql, parameters, id);
        const s3Object = s3urls.fromUrl(s3Url);
        const s3 = new S3();
        aws_sdk_2.config.update({
            accessKeyId: this.config.awsConfig.accessKeyId,
            secretAccessKey: this.config.awsConfig.secretAccessKey,
        });
        const signedUrl = s3.getSignedUrl('getObject', {
            Bucket: s3Object.Bucket,
            Expires: expiration,
            Key: s3Object.Key,
        });
        return signedUrl;
    }
    /**
     * Cancel a AWS Athena query
     *
     * @param {string} id Your custom ID
     *
     * @returns {Promise<void>}
     *
     * @memberof AthenaClient
     */
    async cancelQuery(id) {
        const query = this.queue.getQueryById(id);
        const requestParams = {
            QueryExecutionId: query.athenaId,
        };
        return new Promise((resolve, reject) => {
            this.client.stopQueryExecution(requestParams, (err, data) => {
                if (err != null) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    }
    /**
     * Get WorkGroup details
     *
     * @returns {Promise<Athena.WorkGroup>} AWS WorkGroup Object
     */
    async getWorkGroupDetails() {
        if (this.config.workGroup == null || this.config.workGroup === '') {
            throw new Error('You must define an AWS Athena WorkGroup');
        }
        const parameters = {
            WorkGroup: this.config.workGroup,
        };
        return new Promise((resolve, reject) => {
            this.client.getWorkGroup(parameters, ((err, data) => {
                if (err != null) {
                    return reject(err);
                }
                return resolve(data.WorkGroup);
            }));
        });
    }
    /**
     * Get output S3 bucket from bucketUri config parameter or from WorkGroup
     *
     * @returns {Promise<string>} S3 Bucket URI
     */
    async getOutputS3Bucket() {
        let bucket;
        if (this.config.bucketUri != null && this.config.bucketUri !== '') {
            bucket = this.config.bucketUri;
        }
        else if (this.config.workGroup != null || this.config.workGroup !== '') {
            const workGroup = await this.getWorkGroupDetails();
            bucket = workGroup.Configuration.ResultConfiguration.OutputLocation;
        }
        else {
            throw new Error('You must define a S3 Bucket URI and/or a WorkGroup');
        }
        return bucket;
    }
    async executeQueryCommon(sql, parameters, id) {
        const query = new Query_1.Query(sql, parameters, id);
        this.queue.addQuery(query);
        query.athenaId = await this.startQueryExecution(query);
        try {
            await this.waitUntilSucceedQuery(query);
        }
        catch (exception) {
            this.queue.removeQuery(query);
            throw exception;
        }
        return query;
    }
    /**
     * Starts query execution and gets an ID for the operation
     *
     * @private
     * @param {Query} query - Athena request params
     * @returns {Promise<string>} - query execution id
     * @memberof AthenaClient
     */
    async startQueryExecution(query) {
        const requestParams = {
            QueryExecutionContext: {
                Database: this.config.database,
            },
            QueryString: query.sql,
            ResultConfiguration: {
                OutputLocation: this.config.bucketUri,
            },
        };
        if (this.config.workGroup != null) {
            requestParams.WorkGroup = this.config.workGroup;
        }
        return new Promise((resolve, reject) => {
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
     *
     * @param {Query<T>} query
     * @param {string} nextToken
     * @param {T[]} previousResults
     *
     * @returns {Promise<T[]>} - parsed query result rows
     * @memberof AthenaClient
     */
    getQueryResults(query, nextToken, previousResults) {
        const requestParams = {
            NextToken: nextToken,
            QueryExecutionId: query.athenaId,
        };
        return new Promise((resolve, reject) => {
            this.client.getQueryResults(requestParams, async (err, data) => {
                if (err != null) {
                    return reject(err);
                }
                if (!query.hasColumns()) {
                    query.columns = this.setColumnParsers(data);
                }
                const isFirstPage = !query.hasResults() && nextToken == null;
                query.results.push(...this.parseRows(data.ResultSet.Rows, query.columns, isFirstPage));
                if (data.NextToken != null) {
                    query.results = await this.getQueryResults(query, data.NextToken);
                }
                resolve(query.results);
            });
        });
    }
    /**
     * Parses result rows
     *
     * @private
     * @template T
     * @param {Athena.Row[]} rows - query result rows
     * @param {Column[]} columns - query result columns
     * @param {boolean} isFirstPage
     * @returns {T[]} - parsed result according to needed parser
     * @memberof AthenaClient
     */
    parseRows(rows, columns, isFirstPage = false) {
        const results = [];
        // Start with 1 when first line is column title (in first page)
        for (let rowIndex = (isFirstPage) ? 1 : 0, len = rows.length; rowIndex < len; rowIndex++) {
            const row = rows[rowIndex];
            const result = {};
            for (let rowDataIndex = 0; rowDataIndex < row.Data.length; rowDataIndex++) {
                const rowData = row.Data[rowDataIndex];
                const column = columns[rowDataIndex];
                if (rowData != null && rowData.VarCharValue != null) {
                    result[column.name] = column.parse(rowData.VarCharValue);
                }
                else {
                    result[column.name] = null;
                }
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
     * @returns {Column[]} - column name and parser type
     * @memberof AthenaClient
     */
    setColumnParsers(data) {
        const columns = [];
        for (const columnInfo of data.ResultSet.ResultSetMetadata.ColumnInfo) {
            const column = new Column_1.Column();
            column.name = columnInfo.Name;
            switch (columnInfo.Type) {
                case AthenaDataTypeEnum.Integer:
                case AthenaDataTypeEnum.TinyInt:
                case AthenaDataTypeEnum.SmallInt:
                case AthenaDataTypeEnum.BigInt:
                case AthenaDataTypeEnum.Float:
                case AthenaDataTypeEnum.Double:
                case AthenaDataTypeEnum.Decimal:
                    column.parse = Column_1.Column.parseNumber;
                    break;
                case AthenaDataTypeEnum.Char:
                case AthenaDataTypeEnum.Varchar:
                    column.parse = Column_1.Column.parseString;
                    break;
                case AthenaDataTypeEnum.Boolean:
                    column.parse = Column_1.Column.parseBoolean;
                    break;
                case AthenaDataTypeEnum.Date:
                case AthenaDataTypeEnum.Timestamp:
                case AthenaDataTypeEnum.TimestampWithTz:
                    column.parse = Column_1.Column.parseDate;
                    break;
                case AthenaDataTypeEnum.Array:
                    column.parse = Column_1.Column.parseArray;
                    break;
                case AthenaDataTypeEnum.Json:
                    column.parse = Column_1.Column.parseJson;
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
     * @param {Query} query - the query
     * @returns {Promise<void>} - promise that will resolve once the operation has finished
     * @memberof AthenaClient
     */
    async waitUntilSucceedQuery(query) {
        const requestParams = {
            QueryExecutionId: query.athenaId,
        };
        const waitTime = this.config.waitTime * 1000;
        return new Promise((resolve, reject) => {
            const interval = setInterval(() => {
                this.client.getQueryExecution(requestParams, (err, data) => {
                    if (err != null) {
                        return reject(err);
                    }
                    query.status = data.QueryExecution.Status.State;
                    switch (query.status) {
                        case 'SUCCEEDED':
                            succeeded();
                            break;
                        case 'QUEUED':
                        case 'RUNNING':
                            break;
                        case 'CANCELLED':
                            errored(new QueryCanceledException_1.QueryCanceledException());
                            break;
                        case 'FAILED':
                            errored(new AthenaClientException_1.AthenaClientException('Query failed'));
                            break;
                        default:
                            errored(new AthenaClientException_1.AthenaClientException(`Query Status '${data.QueryExecution.Status.State}' not supported`));
                            break;
                    }
                });
            }, waitTime);
            const succeeded = () => {
                clearInterval(interval);
                resolve();
            };
            const errored = (err) => {
                clearInterval(interval);
                reject(err);
            };
        });
    }
}
exports.AthenaClient = AthenaClient;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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Q3RCO29CQUVELEtBQUssQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDO29CQUVoRCxRQUFRLEtBQUssQ0FBQyxNQUFNLEVBQUU7d0JBQ2xCLEtBQUssV0FBVzs0QkFDWixTQUFTLEVBQUUsQ0FBQzs0QkFDWixNQUFNO3dCQUNWLEtBQUssUUFBUSxDQUFDO3dCQUNkLEtBQUssU0FBUzs0QkFDVixNQUFNO3dCQUNWLEtBQUssV0FBVzs0QkFDWixPQUFPLENBQUMsSUFBSSwrQ0FBc0IsRUFBRSxDQUFDLENBQUM7NEJBQ3RDLE1BQU07d0JBQ1YsS0FBSyxRQUFROzRCQUNULE9BQU8sQ0FBQyxJQUFJLDZDQUFxQixDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUM7NEJBQ25ELE1BQU07d0JBQ1Y7NEJBQ0ksT0FBTyxDQUFDLElBQUksNkNBQXFCLENBQUMsaUJBQWlCLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLEtBQUssaUJBQWlCLENBQUMsQ0FBQyxDQUFDOzRCQUN2RyxNQUFNO3FCQUNiO2dCQUNMLENBQUMsQ0FBQyxDQUFDO1lBQ1AsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBRWIsTUFBTSxTQUFTLEdBQUcsR0FBRyxFQUFFO2dCQUNuQixhQUFhLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ3hCLE9BQU8sRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDO1lBRUYsTUFBTSxPQUFPLEdBQUcsQ0FBQyxHQUFHLEVBQUUsRUFBRTtnQkFDcEIsYUFBYSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUN4QixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDaEIsQ0FBQyxDQUFDO1FBQ04sQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0NBQ0o7QUF6WUQsb0NBeVlDIiwiZmlsZSI6ImluZGV4LmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtBdGhlbmF9IGZyb20gJ2F3cy1zZGsnO1xuaW1wb3J0IHtBdGhlbmFDbGllbnRDb25maWd9IGZyb20gJy4vQXRoZW5hQ2xpZW50Q29uZmlnJztcbmltcG9ydCB7UXVldWV9IGZyb20gJy4vUXVldWUnO1xuaW1wb3J0IHtRdWVyeX0gZnJvbSAnLi9RdWVyeSc7XG5pbXBvcnQge0F0aGVuYUNsaWVudEV4Y2VwdGlvbn0gZnJvbSAnLi9leGNlcHRpb24vQXRoZW5hQ2xpZW50RXhjZXB0aW9uJztcbmltcG9ydCB7UXVlcnlDYW5jZWxlZEV4Y2VwdGlvbn0gZnJvbSAnLi9leGNlcHRpb24vUXVlcnlDYW5jZWxlZEV4Y2VwdGlvbic7XG5pbXBvcnQge0NvbHVtbn0gZnJvbSAnLi9Db2x1bW4nO1xuaW1wb3J0ICogYXMgUzMgZnJvbSAnYXdzLXNkay9jbGllbnRzL3MzJztcbmltcG9ydCB7Y29uZmlnIGFzIGF3c0NvbmZpZ30gZnJvbSAnYXdzLXNkayc7XG5pbXBvcnQgKiBhcyBzM3VybHMgZnJvbSAnQG1hcGJveC9zM3VybHMnO1xuXG5jb25zdCBleHBpcmF0aW9uMURheSA9IDYwICogNjAgKiAyNDtcblxuZW51bSBBdGhlbmFEYXRhVHlwZUVudW0ge1xuICAgIEludGVnZXIgPSAnaW50ZWdlcicsXG4gICAgRmxvYXQgPSAnZmxvYXQnLFxuICAgIERvdWJsZSA9ICdkb3VibGUnLFxuICAgIERlY2ltYWwgPSAnZGVjaW1hbCcsXG4gICAgQ2hhciA9ICdjaGFyJyxcbiAgICBWYXJjaGFyID0gJ3ZhcmNoYXInLFxuICAgIEJvb2xlYW4gPSAnYm9vbGVhbicsXG4gICAgQmluYXJ5ID0gJ2JpbmFyeScsXG4gICAgRGF0ZSA9ICdkYXRlJyxcbiAgICBUaW1lc3RhbXAgPSAndGltZXN0YW1wJyxcbiAgICBUaW1lc3RhbXBXaXRoVHogPSAndGltZXN0YW1wIHdpdGggdGltZSB6b25lJyxcbiAgICBBcnJheSA9ICdhcnJheScsXG4gICAgSnNvbiA9ICdqc29uJyxcbiAgICBNYXAgPSAnbWFwJyxcbiAgICBTdHJ1Y3QgPSAnc3RydWN0JyxcbiAgICBUaW55SW50ID0gJ3RpbnlpbnQnLFxuICAgIFNtYWxsSW50ID0gJ3NtYWxsaW50JyxcbiAgICBCaWdJbnQgPSAnYmlnaW50Jyxcbn1cblxuLyoqXG4gKiBBdGhlbmFDbGllbnQgY2xhc3NcbiAqXG4gKiBAZXhwb3J0XG4gKiBAY2xhc3MgQXRoZW5hQ2xpZW50XG4gKi9cbmV4cG9ydCBjbGFzcyBBdGhlbmFDbGllbnQge1xuICAgIHByaXZhdGUgcmVhZG9ubHkgY2xpZW50OiBBdGhlbmE7XG4gICAgcHJpdmF0ZSByZWFkb25seSBjb25maWc6IEF0aGVuYUNsaWVudENvbmZpZztcblxuICAgIHByaXZhdGUgcXVldWU6IFF1ZXVlO1xuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhbiBpbnN0YW5jZSBvZiBBdGhlbmFDbGllbnQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0F0aGVuYUNsaWVudENvbmZpZ30gY29uZmlnIC0gQ29uZmlnIGZvciBBV1MgQXRoZW5hXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNsaWVudFxuICAgICAqL1xuICAgIHB1YmxpYyBjb25zdHJ1Y3Rvcihjb25maWc6IEF0aGVuYUNsaWVudENvbmZpZykge1xuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgICAgICAgdGhpcy5jb25maWcuYXdzQ29uZmlnLmFwaVZlcnNpb24gPSAnMjAxNy0wNS0xOCc7XG5cbiAgICAgICAgdGhpcy5jbGllbnQgPSBuZXcgQXRoZW5hKHRoaXMuY29uZmlnLmF3c0NvbmZpZyk7XG4gICAgICAgIHRoaXMucXVldWUgPSBuZXcgUXVldWUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFeGVjdXRlIHF1ZXJ5IGluIEF0aGVuYVxuICAgICAqXG4gICAgICogQHRlbXBsYXRlIFRcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBzcWwgLSBxdWVyeSB0byBleGVjdXRlLCBhcyBzdHJpbmdcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gcGFyYW1ldGVycyAtIHBhcmFtZXRlcnMgZm9yIHF1ZXJ5XG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGlkIC0gWW91ciBjdXN0b20gSURcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPFRbXT59IC0gcGFyc2VkIHF1ZXJ5IHJlc3VsdHNcbiAgICAgKlxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDbGllbnRcbiAgICAgKi9cbiAgICBwdWJsaWMgYXN5bmMgZXhlY3V0ZVF1ZXJ5PFQ+KHNxbDogc3RyaW5nLCBwYXJhbWV0ZXJzPzogT2JqZWN0LCBpZD86IHN0cmluZyk6IFByb21pc2U8VFtdPiB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnlDb21tb24oc3FsLCBwYXJhbWV0ZXJzLCBpZCk7XG5cbiAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZ2V0UXVlcnlSZXN1bHRzKHF1ZXJ5KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFeGVjdXRlIHF1ZXJ5IGluIEF0aGVuYSBhbmQgZ2V0IFMzIFVSTCB3aXRoIENTViBmaWxlXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gc3FsIC0gcXVlcnkgdG8gZXhlY3V0ZSwgYXMgc3RyaW5nXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHBhcmFtZXRlcnMgLSBwYXJhbWV0ZXJzIGZvciBxdWVyeVxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBpZCAtIFlvdXIgY3VzdG9tIElEXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxzdHJpbmc+fSAtIFMzIFVSTFxuICAgICAqXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNsaWVudFxuICAgICAqL1xuICAgIHB1YmxpYyBhc3luYyBleGVjdXRlUXVlcnlBbmRHZXRTM1VybChzcWw6IHN0cmluZywgcGFyYW1ldGVycz86IE9iamVjdCwgaWQ/OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgICAgICBjb25zdCBxdWVyeSA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5Q29tbW9uKHNxbCwgcGFyYW1ldGVycywgaWQpO1xuICAgICAgICBjb25zdCBzM0J1Y2tldFVyaSA9IGF3YWl0IHRoaXMuZ2V0T3V0cHV0UzNCdWNrZXQoKTtcblxuICAgICAgICByZXR1cm4gYCR7czNCdWNrZXRVcml9JHtxdWVyeS5hdGhlbmFJZH0uY3N2YDtcbiAgICB9XG5cbiAgICBwdWJsaWMgYXN5bmMgZXhlY3V0ZVF1ZXJ5QW5kR2V0RG93bmxvYWRTaWduZWRVcmwoc3FsOiBzdHJpbmcsIHBhcmFtZXRlcnM/OiBPYmplY3QsIGlkPzogc3RyaW5nLCBleHBpcmF0aW9uID0gZXhwaXJhdGlvbjFEYXkpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgICAgICBjb25zdCBzM1VybCA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5QW5kR2V0UzNVcmwoc3FsLCBwYXJhbWV0ZXJzLCBpZCk7XG4gICAgICAgIGNvbnN0IHMzT2JqZWN0ID0gczN1cmxzLmZyb21VcmwoczNVcmwpO1xuXG4gICAgICAgIGNvbnN0IHMzID0gbmV3IFMzKCk7XG4gICAgICAgIGF3c0NvbmZpZy51cGRhdGUoe1xuICAgICAgICAgICAgYWNjZXNzS2V5SWQ6IHRoaXMuY29uZmlnLmF3c0NvbmZpZy5hY2Nlc3NLZXlJZCxcbiAgICAgICAgICAgIHNlY3JldEFjY2Vzc0tleTogdGhpcy5jb25maWcuYXdzQ29uZmlnLnNlY3JldEFjY2Vzc0tleSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3Qgc2lnbmVkVXJsID0gczMuZ2V0U2lnbmVkVXJsKCdnZXRPYmplY3QnLCB7XG4gICAgICAgICAgICBCdWNrZXQ6IHMzT2JqZWN0LkJ1Y2tldCxcbiAgICAgICAgICAgIEV4cGlyZXM6IGV4cGlyYXRpb24sXG4gICAgICAgICAgICBLZXk6IHMzT2JqZWN0LktleSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHNpZ25lZFVybDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDYW5jZWwgYSBBV1MgQXRoZW5hIHF1ZXJ5XG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gaWQgWW91ciBjdXN0b20gSURcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fVxuICAgICAqXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNsaWVudFxuICAgICAqL1xuICAgIHB1YmxpYyBhc3luYyBjYW5jZWxRdWVyeShpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWV1ZS5nZXRRdWVyeUJ5SWQoaWQpO1xuICAgICAgICBjb25zdCByZXF1ZXN0UGFyYW1zOiBBdGhlbmEuVHlwZXMuU3RvcFF1ZXJ5RXhlY3V0aW9uSW5wdXQgPSB7XG4gICAgICAgICAgICBRdWVyeUV4ZWN1dGlvbklkOiBxdWVyeS5hdGhlbmFJZCxcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5jbGllbnQuc3RvcFF1ZXJ5RXhlY3V0aW9uKHJlcXVlc3RQYXJhbXMsIChlcnIsIGRhdGEpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgV29ya0dyb3VwIGRldGFpbHNcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPEF0aGVuYS5Xb3JrR3JvdXA+fSBBV1MgV29ya0dyb3VwIE9iamVjdFxuICAgICAqL1xuICAgIHB1YmxpYyBhc3luYyBnZXRXb3JrR3JvdXBEZXRhaWxzKCk6IFByb21pc2U8QXRoZW5hLldvcmtHcm91cD4ge1xuICAgICAgICBpZiAodGhpcy5jb25maWcud29ya0dyb3VwID09IG51bGwgfHwgdGhpcy5jb25maWcud29ya0dyb3VwID09PSAnJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdZb3UgbXVzdCBkZWZpbmUgYW4gQVdTIEF0aGVuYSBXb3JrR3JvdXAnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHBhcmFtZXRlcnM6IEF0aGVuYS5HZXRXb3JrR3JvdXBJbnB1dCA9IHtcbiAgICAgICAgICAgIFdvcmtHcm91cDogdGhpcy5jb25maWcud29ya0dyb3VwLFxuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTxBdGhlbmEuV29ya0dyb3VwPigocmVzb2x2ZTogRnVuY3Rpb24sIHJlamVjdDogRnVuY3Rpb24pID0+IHtcbiAgICAgICAgICAgIHRoaXMuY2xpZW50LmdldFdvcmtHcm91cChwYXJhbWV0ZXJzLCAoKGVycjogRXJyb3IsIGRhdGE6IEF0aGVuYS5HZXRXb3JrR3JvdXBPdXRwdXQpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKGRhdGEuV29ya0dyb3VwKTtcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IG91dHB1dCBTMyBidWNrZXQgZnJvbSBidWNrZXRVcmkgY29uZmlnIHBhcmFtZXRlciBvciBmcm9tIFdvcmtHcm91cFxuICAgICAqXG4gICAgICogQHJldHVybnMge1Byb21pc2U8c3RyaW5nPn0gUzMgQnVja2V0IFVSSVxuICAgICAqL1xuICAgIHB1YmxpYyBhc3luYyBnZXRPdXRwdXRTM0J1Y2tldCgpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgICAgICBsZXQgYnVja2V0OiBzdHJpbmc7XG5cbiAgICAgICAgaWYgKHRoaXMuY29uZmlnLmJ1Y2tldFVyaSAhPSBudWxsICYmIHRoaXMuY29uZmlnLmJ1Y2tldFVyaSAhPT0gJycpIHtcbiAgICAgICAgICAgIGJ1Y2tldCA9IHRoaXMuY29uZmlnLmJ1Y2tldFVyaTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmNvbmZpZy53b3JrR3JvdXAgIT0gbnVsbCB8fCB0aGlzLmNvbmZpZy53b3JrR3JvdXAgIT09ICcnKSB7XG4gICAgICAgICAgICBjb25zdCB3b3JrR3JvdXAgPSBhd2FpdCB0aGlzLmdldFdvcmtHcm91cERldGFpbHMoKTtcblxuICAgICAgICAgICAgYnVja2V0ID0gd29ya0dyb3VwLkNvbmZpZ3VyYXRpb24uUmVzdWx0Q29uZmlndXJhdGlvbi5PdXRwdXRMb2NhdGlvbjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignWW91IG11c3QgZGVmaW5lIGEgUzMgQnVja2V0IFVSSSBhbmQvb3IgYSBXb3JrR3JvdXAnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBidWNrZXQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBleGVjdXRlUXVlcnlDb21tb24oc3FsOiBzdHJpbmcsIHBhcmFtZXRlcnM/OiBPYmplY3QsIGlkPzogc3RyaW5nKTogUHJvbWlzZTxRdWVyeT4ge1xuICAgICAgICBjb25zdCBxdWVyeSA9IG5ldyBRdWVyeShzcWwsIHBhcmFtZXRlcnMsIGlkKTtcblxuICAgICAgICB0aGlzLnF1ZXVlLmFkZFF1ZXJ5KHF1ZXJ5KTtcblxuICAgICAgICBxdWVyeS5hdGhlbmFJZCA9IGF3YWl0IHRoaXMuc3RhcnRRdWVyeUV4ZWN1dGlvbihxdWVyeSk7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMud2FpdFVudGlsU3VjY2VlZFF1ZXJ5KHF1ZXJ5KTtcbiAgICAgICAgfSBjYXRjaCAoZXhjZXB0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXVlLnJlbW92ZVF1ZXJ5KHF1ZXJ5KTtcblxuICAgICAgICAgICAgdGhyb3cgZXhjZXB0aW9uO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFN0YXJ0cyBxdWVyeSBleGVjdXRpb24gYW5kIGdldHMgYW4gSUQgZm9yIHRoZSBvcGVyYXRpb25cbiAgICAgKlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHBhcmFtIHtRdWVyeX0gcXVlcnkgLSBBdGhlbmEgcmVxdWVzdCBwYXJhbXNcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxzdHJpbmc+fSAtIHF1ZXJ5IGV4ZWN1dGlvbiBpZFxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDbGllbnRcbiAgICAgKi9cbiAgICBwcml2YXRlIGFzeW5jIHN0YXJ0UXVlcnlFeGVjdXRpb24ocXVlcnk6IFF1ZXJ5KTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICAgICAgY29uc3QgcmVxdWVzdFBhcmFtczogQXRoZW5hLlR5cGVzLlN0YXJ0UXVlcnlFeGVjdXRpb25JbnB1dCA9IHtcbiAgICAgICAgICAgIFF1ZXJ5RXhlY3V0aW9uQ29udGV4dDoge1xuICAgICAgICAgICAgICAgIERhdGFiYXNlOiB0aGlzLmNvbmZpZy5kYXRhYmFzZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBRdWVyeVN0cmluZzogcXVlcnkuc3FsLFxuICAgICAgICAgICAgUmVzdWx0Q29uZmlndXJhdGlvbjoge1xuICAgICAgICAgICAgICAgIE91dHB1dExvY2F0aW9uOiB0aGlzLmNvbmZpZy5idWNrZXRVcmksXG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuXG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy53b3JrR3JvdXAgIT0gbnVsbCkge1xuICAgICAgICAgICAgcmVxdWVzdFBhcmFtcy5Xb3JrR3JvdXAgPSB0aGlzLmNvbmZpZy53b3JrR3JvdXA7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICB0aGlzLmNsaWVudC5zdGFydFF1ZXJ5RXhlY3V0aW9uKHJlcXVlc3RQYXJhbXMsIChlcnIsIGRhdGEpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKGRhdGEuUXVlcnlFeGVjdXRpb25JZCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUHJvY2Vzc2VzIHF1ZXJ5IHJlc3VsdHMgYW5kIHBhcnNlcyB0aGVtXG4gICAgICpcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqIEB0ZW1wbGF0ZSBUXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1F1ZXJ5PFQ+fSBxdWVyeVxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuZXh0VG9rZW5cbiAgICAgKiBAcGFyYW0ge1RbXX0gcHJldmlvdXNSZXN1bHRzXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxUW10+fSAtIHBhcnNlZCBxdWVyeSByZXN1bHQgcm93c1xuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDbGllbnRcbiAgICAgKi9cbiAgICBwcml2YXRlIGdldFF1ZXJ5UmVzdWx0czxUPihxdWVyeTogUXVlcnk8VD4sIG5leHRUb2tlbj86IHN0cmluZywgcHJldmlvdXNSZXN1bHRzPzogVFtdKTogUHJvbWlzZTxUW10+IHtcbiAgICAgICAgY29uc3QgcmVxdWVzdFBhcmFtczogQXRoZW5hLlR5cGVzLkdldFF1ZXJ5UmVzdWx0c0lucHV0ID0ge1xuICAgICAgICAgICAgTmV4dFRva2VuOiBuZXh0VG9rZW4sXG4gICAgICAgICAgICBRdWVyeUV4ZWN1dGlvbklkOiBxdWVyeS5hdGhlbmFJZCxcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8VFtdPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICB0aGlzLmNsaWVudC5nZXRRdWVyeVJlc3VsdHMocmVxdWVzdFBhcmFtcywgYXN5bmMgKGVyciwgZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKCFxdWVyeS5oYXNDb2x1bW5zKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcXVlcnkuY29sdW1ucyA9IHRoaXMuc2V0Q29sdW1uUGFyc2VycyhkYXRhKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBpc0ZpcnN0UGFnZSA9ICFxdWVyeS5oYXNSZXN1bHRzKCkgJiYgbmV4dFRva2VuID09IG51bGw7XG5cbiAgICAgICAgICAgICAgICBxdWVyeS5yZXN1bHRzLnB1c2goLi4udGhpcy5wYXJzZVJvd3M8VD4oZGF0YS5SZXN1bHRTZXQuUm93cywgcXVlcnkuY29sdW1ucywgaXNGaXJzdFBhZ2UpKTtcblxuICAgICAgICAgICAgICAgIGlmIChkYXRhLk5leHRUb2tlbiAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LnJlc3VsdHMgPSBhd2FpdCB0aGlzLmdldFF1ZXJ5UmVzdWx0czxUPihxdWVyeSwgZGF0YS5OZXh0VG9rZW4pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJlc29sdmUocXVlcnkucmVzdWx0cyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGFyc2VzIHJlc3VsdCByb3dzXG4gICAgICpcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqIEB0ZW1wbGF0ZSBUXG4gICAgICogQHBhcmFtIHtBdGhlbmEuUm93W119IHJvd3MgLSBxdWVyeSByZXN1bHQgcm93c1xuICAgICAqIEBwYXJhbSB7Q29sdW1uW119IGNvbHVtbnMgLSBxdWVyeSByZXN1bHQgY29sdW1uc1xuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gaXNGaXJzdFBhZ2VcbiAgICAgKiBAcmV0dXJucyB7VFtdfSAtIHBhcnNlZCByZXN1bHQgYWNjb3JkaW5nIHRvIG5lZWRlZCBwYXJzZXJcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHJpdmF0ZSBwYXJzZVJvd3M8VD4ocm93czogQXRoZW5hLlJvd1tdLCBjb2x1bW5zOiBDb2x1bW5bXSwgaXNGaXJzdFBhZ2UgPSBmYWxzZSk6IFRbXSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdHM6IFRbXSA9IFtdO1xuXG4gICAgICAgIC8vIFN0YXJ0IHdpdGggMSB3aGVuIGZpcnN0IGxpbmUgaXMgY29sdW1uIHRpdGxlIChpbiBmaXJzdCBwYWdlKVxuICAgICAgICBmb3IgKGxldCByb3dJbmRleCA9IChpc0ZpcnN0UGFnZSkgPyAxIDogMCwgbGVuID0gcm93cy5sZW5ndGg7IHJvd0luZGV4IDwgbGVuOyByb3dJbmRleCsrKSB7XG4gICAgICAgICAgICBjb25zdCByb3cgPSByb3dzW3Jvd0luZGV4XTtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogVCA9IDxUPnt9O1xuXG4gICAgICAgICAgICBmb3IgKGxldCByb3dEYXRhSW5kZXggPSAwOyByb3dEYXRhSW5kZXggPCByb3cuRGF0YS5sZW5ndGg7IHJvd0RhdGFJbmRleCsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgcm93RGF0YSA9IHJvdy5EYXRhW3Jvd0RhdGFJbmRleF07XG4gICAgICAgICAgICAgICAgY29uc3QgY29sdW1uID0gY29sdW1uc1tyb3dEYXRhSW5kZXhdO1xuXG4gICAgICAgICAgICAgICAgaWYgKHJvd0RhdGEgIT0gbnVsbCAmJiByb3dEYXRhLlZhckNoYXJWYWx1ZSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdFtjb2x1bW4ubmFtZV0gPSBjb2x1bW4ucGFyc2Uocm93RGF0YS5WYXJDaGFyVmFsdWUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdFtjb2x1bW4ubmFtZV0gPSBudWxsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVzdWx0cy5wdXNoKHJlc3VsdCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXQgYXBwcm9wcmlhdGUgY29sdW1uIHBhcnNlcnMgYWNjb3JkaW5nIHRvIGNvbHVtbnMnIGRhdGEgdHlwZVxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAcGFyYW0geyp9IGRhdGEgLSBxdWVyeSByZXN1bHRzXG4gICAgICogQHJldHVybnMge0NvbHVtbltdfSAtIGNvbHVtbiBuYW1lIGFuZCBwYXJzZXIgdHlwZVxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDbGllbnRcbiAgICAgKi9cbiAgICBwcml2YXRlIHNldENvbHVtblBhcnNlcnMoZGF0YSk6IENvbHVtbltdIHtcbiAgICAgICAgY29uc3QgY29sdW1uczogQ29sdW1uW10gPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IGNvbHVtbkluZm8gb2YgZGF0YS5SZXN1bHRTZXQuUmVzdWx0U2V0TWV0YWRhdGEuQ29sdW1uSW5mbykge1xuICAgICAgICAgICAgY29uc3QgY29sdW1uID0gbmV3IENvbHVtbigpO1xuICAgICAgICAgICAgY29sdW1uLm5hbWUgPSBjb2x1bW5JbmZvLk5hbWU7XG5cbiAgICAgICAgICAgIHN3aXRjaCAoY29sdW1uSW5mby5UeXBlIGFzIEF0aGVuYURhdGFUeXBlRW51bSkge1xuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkludGVnZXI6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uVGlueUludDpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5TbWFsbEludDpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5CaWdJbnQ6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uRmxvYXQ6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uRG91YmxlOlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkRlY2ltYWw6XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbi5wYXJzZSA9IENvbHVtbi5wYXJzZU51bWJlcjtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5DaGFyOlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLlZhcmNoYXI6XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbi5wYXJzZSA9IENvbHVtbi5wYXJzZVN0cmluZztcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5Cb29sZWFuOlxuICAgICAgICAgICAgICAgICAgICBjb2x1bW4ucGFyc2UgPSBDb2x1bW4ucGFyc2VCb29sZWFuO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkRhdGU6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uVGltZXN0YW1wOlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLlRpbWVzdGFtcFdpdGhUejpcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uLnBhcnNlID0gQ29sdW1uLnBhcnNlRGF0ZTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5BcnJheTpcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uLnBhcnNlID0gQ29sdW1uLnBhcnNlQXJyYXk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkpzb246XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbi5wYXJzZSA9IENvbHVtbi5wYXJzZUpzb247XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkJpbmFyeTpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5NYXA6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uU3RydWN0OlxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ29sdW1uIHR5cGUgJyR7Y29sdW1uSW5mby5UeXBlfScgbm90IHN1cHBvcnRlZGApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb2x1bW5zLnB1c2goY29sdW1uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBjb2x1bW5zO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENoZWNrcyB0aGUgcXVlcnkgZXhlY3V0aW9uIHN0YXR1cyB1bnRpbCB0aGUgcXVlcnkgc2VuZHMgU1VDQ0VFREVEIHNpZ25hbFxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAcGFyYW0ge1F1ZXJ5fSBxdWVyeSAtIHRoZSBxdWVyeVxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fSAtIHByb21pc2UgdGhhdCB3aWxsIHJlc29sdmUgb25jZSB0aGUgb3BlcmF0aW9uIGhhcyBmaW5pc2hlZFxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDbGllbnRcbiAgICAgKi9cbiAgICBwcml2YXRlIGFzeW5jIHdhaXRVbnRpbFN1Y2NlZWRRdWVyeShxdWVyeTogUXVlcnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgcmVxdWVzdFBhcmFtczogQXRoZW5hLlR5cGVzLkdldFF1ZXJ5RXhlY3V0aW9uSW5wdXQgPSB7XG4gICAgICAgICAgICBRdWVyeUV4ZWN1dGlvbklkOiBxdWVyeS5hdGhlbmFJZCxcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCB3YWl0VGltZSA9IHRoaXMuY29uZmlnLndhaXRUaW1lICogMTAwMDtcblxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgaW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5jbGllbnQuZ2V0UXVlcnlFeGVjdXRpb24ocmVxdWVzdFBhcmFtcywgKGVyciwgZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXJyICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LnN0YXR1cyA9IGRhdGEuUXVlcnlFeGVjdXRpb24uU3RhdHVzLlN0YXRlO1xuXG4gICAgICAgICAgICAgICAgICAgIHN3aXRjaCAocXVlcnkuc3RhdHVzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdTVUNDRUVERUQnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2NlZWRlZCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnUVVFVUVEJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ1JVTk5JTkcnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnQ0FOQ0VMTEVEJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcmVkKG5ldyBRdWVyeUNhbmNlbGVkRXhjZXB0aW9uKCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnRkFJTEVEJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcmVkKG5ldyBBdGhlbmFDbGllbnRFeGNlcHRpb24oJ1F1ZXJ5IGZhaWxlZCcpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3JlZChuZXcgQXRoZW5hQ2xpZW50RXhjZXB0aW9uKGBRdWVyeSBTdGF0dXMgJyR7ZGF0YS5RdWVyeUV4ZWN1dGlvbi5TdGF0dXMuU3RhdGV9JyBub3Qgc3VwcG9ydGVkYCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCB3YWl0VGltZSk7XG5cbiAgICAgICAgICAgIGNvbnN0IHN1Y2NlZWRlZCA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKGludGVydmFsKTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBlcnJvcmVkID0gKGVycikgPT4ge1xuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwoaW50ZXJ2YWwpO1xuICAgICAgICAgICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgfVxufVxuIl19
