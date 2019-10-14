"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const aws_sdk_1 = require("aws-sdk");
const Queue_1 = require("./Queue");
const Query_1 = require("./Query");
const AthenaClientException_1 = require("./exception/AthenaClientException");
const QueryCanceledException_1 = require("./exception/QueryCanceledException");
const Column_1 = require("./Column");
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
     * @param {string} queryExecutionId - query execution identifier
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
                query.results = query.results.concat(this.parseRows(data.ResultSet.Rows, query.columns, isFirstPage));
                if (data.NextToken != null) {
                    query.results = await this.getQueryResults(query, data.NextToken);
                }
                console.log(`Tengo los resultados ${query.results.length}`);
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
        for (let rowIndex = (isFirstPage) ? 1 : 0; rowIndex < rows.length; rowIndex++) {
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
                    console.log('Checking');
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
                console.log('terminado');
                clearInterval(interval);
                resolve();
            };
            const errored = (err) => {
                console.log('terminado mal', err);
                clearInterval(interval);
                reject(err);
            };
        });
    }
}
exports.AthenaClient = AthenaClient;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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Q25CLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7Z0JBQ3pCLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDeEIsT0FBTyxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUM7WUFFRixNQUFNLE9BQU8sR0FBRyxDQUFDLEdBQUcsRUFBRSxFQUFFO2dCQUNwQixPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsRUFBRSxHQUFHLENBQUMsQ0FBQztnQkFDbEMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUN4QixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDaEIsQ0FBQyxDQUFDO1FBQ04sQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0NBQ0o7QUEzWEQsb0NBMlhDIiwiZmlsZSI6ImluZGV4LmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtBdGhlbmF9IGZyb20gJ2F3cy1zZGsnO1xuaW1wb3J0IHtBdGhlbmFDbGllbnRDb25maWd9IGZyb20gJy4vQXRoZW5hQ2xpZW50Q29uZmlnJztcbmltcG9ydCB7UXVldWV9IGZyb20gJy4vUXVldWUnO1xuaW1wb3J0IHtRdWVyeX0gZnJvbSAnLi9RdWVyeSc7XG5pbXBvcnQge0F0aGVuYUNsaWVudEV4Y2VwdGlvbn0gZnJvbSAnLi9leGNlcHRpb24vQXRoZW5hQ2xpZW50RXhjZXB0aW9uJztcbmltcG9ydCB7UXVlcnlDYW5jZWxlZEV4Y2VwdGlvbn0gZnJvbSAnLi9leGNlcHRpb24vUXVlcnlDYW5jZWxlZEV4Y2VwdGlvbic7XG5pbXBvcnQge0NvbHVtbn0gZnJvbSAnLi9Db2x1bW4nO1xuXG5lbnVtIEF0aGVuYURhdGFUeXBlRW51bSB7XG4gICAgSW50ZWdlciA9ICdpbnRlZ2VyJyxcbiAgICBGbG9hdCA9ICdmbG9hdCcsXG4gICAgRG91YmxlID0gJ2RvdWJsZScsXG4gICAgRGVjaW1hbCA9ICdkZWNpbWFsJyxcbiAgICBDaGFyID0gJ2NoYXInLFxuICAgIFZhcmNoYXIgPSAndmFyY2hhcicsXG4gICAgQm9vbGVhbiA9ICdib29sZWFuJyxcbiAgICBCaW5hcnkgPSAnYmluYXJ5JyxcbiAgICBEYXRlID0gJ2RhdGUnLFxuICAgIFRpbWVzdGFtcCA9ICd0aW1lc3RhbXAnLFxuICAgIFRpbWVzdGFtcFdpdGhUeiA9ICd0aW1lc3RhbXAgd2l0aCB0aW1lIHpvbmUnLFxuICAgIEFycmF5ID0gJ2FycmF5JyxcbiAgICBKc29uID0gJ2pzb24nLFxuICAgIE1hcCA9ICdtYXAnLFxuICAgIFN0cnVjdCA9ICdzdHJ1Y3QnLFxuICAgIFRpbnlJbnQgPSAndGlueWludCcsXG4gICAgU21hbGxJbnQgPSAnc21hbGxpbnQnLFxuICAgIEJpZ0ludCA9ICdiaWdpbnQnLFxufVxuXG4vKipcbiAqIEF0aGVuYUNsaWVudCBjbGFzc1xuICpcbiAqIEBleHBvcnRcbiAqIEBjbGFzcyBBdGhlbmFDbGllbnRcbiAqL1xuZXhwb3J0IGNsYXNzIEF0aGVuYUNsaWVudCB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBjbGllbnQ6IEF0aGVuYTtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZzogQXRoZW5hQ2xpZW50Q29uZmlnO1xuXG4gICAgcHJpdmF0ZSBxdWV1ZTogUXVldWU7XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGFuIGluc3RhbmNlIG9mIEF0aGVuYUNsaWVudC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7QXRoZW5hQ2xpZW50Q29uZmlnfSBjb25maWcgLSBDb25maWcgZm9yIEFXUyBBdGhlbmFcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGNvbmZpZzogQXRoZW5hQ2xpZW50Q29uZmlnKSB7XG4gICAgICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICAgICAgICB0aGlzLmNvbmZpZy5hd3NDb25maWcuYXBpVmVyc2lvbiA9ICcyMDE3LTA1LTE4JztcblxuICAgICAgICB0aGlzLmNsaWVudCA9IG5ldyBBdGhlbmEodGhpcy5jb25maWcuYXdzQ29uZmlnKTtcbiAgICAgICAgdGhpcy5xdWV1ZSA9IG5ldyBRdWV1ZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgcXVlcnkgaW4gQXRoZW5hXG4gICAgICpcbiAgICAgKiBAdGVtcGxhdGUgVFxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHNxbCAtIHF1ZXJ5IHRvIGV4ZWN1dGUsIGFzIHN0cmluZ1xuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBwYXJhbWV0ZXJzIC0gcGFyYW1ldGVycyBmb3IgcXVlcnlcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gaWQgLSBZb3VyIGN1c3RvbSBJRFxuICAgICAqXG4gICAgICogQHJldHVybnMge1Byb21pc2U8VFtdPn0gLSBwYXJzZWQgcXVlcnkgcmVzdWx0c1xuICAgICAqXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNsaWVudFxuICAgICAqL1xuICAgIHB1YmxpYyBhc3luYyBleGVjdXRlUXVlcnk8VD4oc3FsOiBzdHJpbmcsIHBhcmFtZXRlcnM/OiBPYmplY3QsIGlkPzogc3RyaW5nKTogUHJvbWlzZTxUW10+IHtcbiAgICAgICAgY29uc3QgcXVlcnkgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeUNvbW1vbihzcWwsIHBhcmFtZXRlcnMsIGlkKTtcblxuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5nZXRRdWVyeVJlc3VsdHMocXVlcnkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgcXVlcnkgaW4gQXRoZW5hIGFuZCBnZXQgUzMgVVJMIHdpdGggQ1NWIGZpbGVcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBzcWwgLSBxdWVyeSB0byBleGVjdXRlLCBhcyBzdHJpbmdcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gcGFyYW1ldGVycyAtIHBhcmFtZXRlcnMgZm9yIHF1ZXJ5XG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGlkIC0gWW91ciBjdXN0b20gSURcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPHN0cmluZz59IC0gUzMgVVJMXG4gICAgICpcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHVibGljIGFzeW5jIGV4ZWN1dGVRdWVyeUFuZEdldFMzVXJsKHNxbDogc3RyaW5nLCBwYXJhbWV0ZXJzPzogT2JqZWN0LCBpZD86IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnlDb21tb24oc3FsLCBwYXJhbWV0ZXJzLCBpZCk7XG4gICAgICAgIGNvbnN0IHMzQnVja2V0VXJpID0gYXdhaXQgdGhpcy5nZXRPdXRwdXRTM0J1Y2tldCgpO1xuXG4gICAgICAgIHJldHVybiBgJHtzM0J1Y2tldFVyaX0ke3F1ZXJ5LmF0aGVuYUlkfS5jc3ZgO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENhbmNlbCBhIEFXUyBBdGhlbmEgcXVlcnlcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBpZCBZb3VyIGN1c3RvbSBJRFxuICAgICAqXG4gICAgICogQHJldHVybnMge1Byb21pc2U8dm9pZD59XG4gICAgICpcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHVibGljIGFzeW5jIGNhbmNlbFF1ZXJ5KGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgcXVlcnkgPSB0aGlzLnF1ZXVlLmdldFF1ZXJ5QnlJZChpZCk7XG4gICAgICAgIGNvbnN0IHJlcXVlc3RQYXJhbXM6IEF0aGVuYS5UeXBlcy5TdG9wUXVlcnlFeGVjdXRpb25JbnB1dCA9IHtcbiAgICAgICAgICAgIFF1ZXJ5RXhlY3V0aW9uSWQ6IHF1ZXJ5LmF0aGVuYUlkLFxuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICB0aGlzLmNsaWVudC5zdG9wUXVlcnlFeGVjdXRpb24ocmVxdWVzdFBhcmFtcywgKGVyciwgZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCBXb3JrR3JvdXAgZGV0YWlsc1xuICAgICAqXG4gICAgICogQHJldHVybnMge1Byb21pc2U8QXRoZW5hLldvcmtHcm91cD59IEFXUyBXb3JrR3JvdXAgT2JqZWN0XG4gICAgICovXG4gICAgcHVibGljIGFzeW5jIGdldFdvcmtHcm91cERldGFpbHMoKTogUHJvbWlzZTxBdGhlbmEuV29ya0dyb3VwPiB7XG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy53b3JrR3JvdXAgPT0gbnVsbCB8fCB0aGlzLmNvbmZpZy53b3JrR3JvdXAgPT09ICcnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1lvdSBtdXN0IGRlZmluZSBhbiBBV1MgQXRoZW5hIFdvcmtHcm91cCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcGFyYW1ldGVyczogQXRoZW5hLkdldFdvcmtHcm91cElucHV0ID0ge1xuICAgICAgICAgICAgV29ya0dyb3VwOiB0aGlzLmNvbmZpZy53b3JrR3JvdXAsXG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPEF0aGVuYS5Xb3JrR3JvdXA+KChyZXNvbHZlOiBGdW5jdGlvbiwgcmVqZWN0OiBGdW5jdGlvbikgPT4ge1xuICAgICAgICAgICAgdGhpcy5jbGllbnQuZ2V0V29ya0dyb3VwKHBhcmFtZXRlcnMsICgoZXJyOiBFcnJvciwgZGF0YTogQXRoZW5hLkdldFdvcmtHcm91cE91dHB1dCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUoZGF0YS5Xb3JrR3JvdXApO1xuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgb3V0cHV0IFMzIGJ1Y2tldCBmcm9tIGJ1Y2tldFVyaSBjb25maWcgcGFyYW1ldGVyIG9yIGZyb20gV29ya0dyb3VwXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxzdHJpbmc+fSBTMyBCdWNrZXQgVVJJXG4gICAgICovXG4gICAgcHVibGljIGFzeW5jIGdldE91dHB1dFMzQnVja2V0KCk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgICAgIGxldCBidWNrZXQ6IHN0cmluZztcblxuICAgICAgICBpZiAodGhpcy5jb25maWcuYnVja2V0VXJpICE9IG51bGwgJiYgdGhpcy5jb25maWcuYnVja2V0VXJpICE9PSAnJykge1xuICAgICAgICAgICAgYnVja2V0ID0gdGhpcy5jb25maWcuYnVja2V0VXJpO1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuY29uZmlnLndvcmtHcm91cCAhPSBudWxsIHx8IHRoaXMuY29uZmlnLndvcmtHcm91cCAhPT0gJycpIHtcbiAgICAgICAgICAgIGNvbnN0IHdvcmtHcm91cCA9IGF3YWl0IHRoaXMuZ2V0V29ya0dyb3VwRGV0YWlscygpO1xuXG4gICAgICAgICAgICBidWNrZXQgPSB3b3JrR3JvdXAuQ29uZmlndXJhdGlvbi5SZXN1bHRDb25maWd1cmF0aW9uLk91dHB1dExvY2F0aW9uO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdZb3UgbXVzdCBkZWZpbmUgYSBTMyBCdWNrZXQgVVJJIGFuZC9vciBhIFdvcmtHcm91cCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGJ1Y2tldDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVRdWVyeUNvbW1vbihzcWw6IHN0cmluZywgcGFyYW1ldGVycz86IE9iamVjdCwgaWQ/OiBzdHJpbmcpOiBQcm9taXNlPFF1ZXJ5PiB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gbmV3IFF1ZXJ5KHNxbCwgcGFyYW1ldGVycywgaWQpO1xuXG4gICAgICAgIHRoaXMucXVldWUuYWRkUXVlcnkocXVlcnkpO1xuXG4gICAgICAgIHF1ZXJ5LmF0aGVuYUlkID0gYXdhaXQgdGhpcy5zdGFydFF1ZXJ5RXhlY3V0aW9uKHF1ZXJ5KTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy53YWl0VW50aWxTdWNjZWVkUXVlcnkocXVlcnkpO1xuICAgICAgICB9IGNhdGNoIChleGNlcHRpb24pIHtcbiAgICAgICAgICAgIHRoaXMucXVldWUucmVtb3ZlUXVlcnkocXVlcnkpO1xuXG4gICAgICAgICAgICB0aHJvdyBleGNlcHRpb247XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3RhcnRzIHF1ZXJ5IGV4ZWN1dGlvbiBhbmQgZ2V0cyBhbiBJRCBmb3IgdGhlIG9wZXJhdGlvblxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAcGFyYW0ge1F1ZXJ5fSBxdWVyeSAtIEF0aGVuYSByZXF1ZXN0IHBhcmFtc1xuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPHN0cmluZz59IC0gcXVlcnkgZXhlY3V0aW9uIGlkXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNsaWVudFxuICAgICAqL1xuICAgIHByaXZhdGUgYXN5bmMgc3RhcnRRdWVyeUV4ZWN1dGlvbihxdWVyeTogUXVlcnkpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgICAgICBjb25zdCByZXF1ZXN0UGFyYW1zOiBBdGhlbmEuVHlwZXMuU3RhcnRRdWVyeUV4ZWN1dGlvbklucHV0ID0ge1xuICAgICAgICAgICAgUXVlcnlFeGVjdXRpb25Db250ZXh0OiB7XG4gICAgICAgICAgICAgICAgRGF0YWJhc2U6IHRoaXMuY29uZmlnLmRhdGFiYXNlLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFF1ZXJ5U3RyaW5nOiBxdWVyeS5zcWwsXG4gICAgICAgICAgICBSZXN1bHRDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgICAgICAgT3V0cHV0TG9jYXRpb246IHRoaXMuY29uZmlnLmJ1Y2tldFVyaSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKHRoaXMuY29uZmlnLndvcmtHcm91cCAhPSBudWxsKSB7XG4gICAgICAgICAgICByZXF1ZXN0UGFyYW1zLldvcmtHcm91cCA9IHRoaXMuY29uZmlnLndvcmtHcm91cDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTxzdHJpbmc+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRoaXMuY2xpZW50LnN0YXJ0UXVlcnlFeGVjdXRpb24ocmVxdWVzdFBhcmFtcywgKGVyciwgZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUoZGF0YS5RdWVyeUV4ZWN1dGlvbklkKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQcm9jZXNzZXMgcXVlcnkgcmVzdWx0cyBhbmQgcGFyc2VzIHRoZW1cbiAgICAgKlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHRlbXBsYXRlIFRcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBxdWVyeUV4ZWN1dGlvbklkIC0gcXVlcnkgZXhlY3V0aW9uIGlkZW50aWZpZXJcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmV4dFRva2VuXG4gICAgICogQHBhcmFtIHtUW119IHByZXZpb3VzUmVzdWx0c1xuICAgICAqXG4gICAgICogQHJldHVybnMge1Byb21pc2U8VFtdPn0gLSBwYXJzZWQgcXVlcnkgcmVzdWx0IHJvd3NcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHJpdmF0ZSBnZXRRdWVyeVJlc3VsdHM8VD4ocXVlcnk6IFF1ZXJ5PFQ+LCBuZXh0VG9rZW4/OiBzdHJpbmcsIHByZXZpb3VzUmVzdWx0cz86IFRbXSk6IFByb21pc2U8VFtdPiB7XG4gICAgICAgIGNvbnN0IHJlcXVlc3RQYXJhbXM6IEF0aGVuYS5UeXBlcy5HZXRRdWVyeVJlc3VsdHNJbnB1dCA9IHtcbiAgICAgICAgICAgIE5leHRUb2tlbjogbmV4dFRva2VuLFxuICAgICAgICAgICAgUXVlcnlFeGVjdXRpb25JZDogcXVlcnkuYXRoZW5hSWQsXG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPFRbXT4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5jbGllbnQuZ2V0UXVlcnlSZXN1bHRzKHJlcXVlc3RQYXJhbXMsIGFzeW5jIChlcnIsIGRhdGEpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICghcXVlcnkuaGFzQ29sdW1ucygpKSB7XG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LmNvbHVtbnMgPSB0aGlzLnNldENvbHVtblBhcnNlcnMoZGF0YSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29uc3QgaXNGaXJzdFBhZ2UgPSAhcXVlcnkuaGFzUmVzdWx0cygpICYmIG5leHRUb2tlbiA9PSBudWxsO1xuXG4gICAgICAgICAgICAgICAgcXVlcnkucmVzdWx0cyA9IHF1ZXJ5LnJlc3VsdHMuY29uY2F0KHRoaXMucGFyc2VSb3dzPFQ+KGRhdGEuUmVzdWx0U2V0LlJvd3MsIHF1ZXJ5LmNvbHVtbnMsIGlzRmlyc3RQYWdlKSk7XG5cbiAgICAgICAgICAgICAgICBpZiAoZGF0YS5OZXh0VG9rZW4gIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICBxdWVyeS5yZXN1bHRzID0gYXdhaXQgdGhpcy5nZXRRdWVyeVJlc3VsdHM8VD4ocXVlcnksIGRhdGEuTmV4dFRva2VuKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgVGVuZ28gbG9zIHJlc3VsdGFkb3MgJHtxdWVyeS5yZXN1bHRzLmxlbmd0aH1gKTtcblxuICAgICAgICAgICAgICAgIHJlc29sdmUocXVlcnkucmVzdWx0cyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGFyc2VzIHJlc3VsdCByb3dzXG4gICAgICpcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqIEB0ZW1wbGF0ZSBUXG4gICAgICogQHBhcmFtIHtBdGhlbmEuUm93W119IHJvd3MgLSBxdWVyeSByZXN1bHQgcm93c1xuICAgICAqIEBwYXJhbSB7Q29sdW1uW119IGNvbHVtbnMgLSBxdWVyeSByZXN1bHQgY29sdW1uc1xuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gaXNGaXJzdFBhZ2VcbiAgICAgKiBAcmV0dXJucyB7VFtdfSAtIHBhcnNlZCByZXN1bHQgYWNjb3JkaW5nIHRvIG5lZWRlZCBwYXJzZXJcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHJpdmF0ZSBwYXJzZVJvd3M8VD4ocm93czogQXRoZW5hLlJvd1tdLCBjb2x1bW5zOiBDb2x1bW5bXSwgaXNGaXJzdFBhZ2UgPSBmYWxzZSk6IFRbXSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdHM6IFRbXSA9IFtdO1xuXG4gICAgICAgIC8vIFN0YXJ0IHdpdGggMSB3aGVuIGZpcnN0IGxpbmUgaXMgY29sdW1uIHRpdGxlIChpbiBmaXJzdCBwYWdlKVxuICAgICAgICBmb3IgKGxldCByb3dJbmRleCA9IChpc0ZpcnN0UGFnZSkgPyAxIDogMDsgcm93SW5kZXggPCByb3dzLmxlbmd0aDsgcm93SW5kZXgrKykge1xuICAgICAgICAgICAgY29uc3Qgcm93ID0gcm93c1tyb3dJbmRleF07XG4gICAgICAgICAgICBjb25zdCByZXN1bHQ6IFQgPSA8VD57fTtcblxuICAgICAgICAgICAgZm9yIChsZXQgcm93RGF0YUluZGV4ID0gMDsgcm93RGF0YUluZGV4IDwgcm93LkRhdGEubGVuZ3RoOyByb3dEYXRhSW5kZXgrKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJvd0RhdGEgPSByb3cuRGF0YVtyb3dEYXRhSW5kZXhdO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbHVtbiA9IGNvbHVtbnNbcm93RGF0YUluZGV4XTtcblxuICAgICAgICAgICAgICAgIGlmIChyb3dEYXRhICE9IG51bGwgJiYgcm93RGF0YS5WYXJDaGFyVmFsdWUgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHRbY29sdW1uLm5hbWVdID0gY29sdW1uLnBhcnNlKHJvd0RhdGEuVmFyQ2hhclZhbHVlKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHRbY29sdW1uLm5hbWVdID0gbnVsbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJlc3VsdHMucHVzaChyZXN1bHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0IGFwcHJvcHJpYXRlIGNvbHVtbiBwYXJzZXJzIGFjY29yZGluZyB0byBjb2x1bW5zJyBkYXRhIHR5cGVcbiAgICAgKlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHBhcmFtIHsqfSBkYXRhIC0gcXVlcnkgcmVzdWx0c1xuICAgICAqIEByZXR1cm5zIHtDb2x1bW5bXX0gLSBjb2x1bW4gbmFtZSBhbmQgcGFyc2VyIHR5cGVcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHJpdmF0ZSBzZXRDb2x1bW5QYXJzZXJzKGRhdGEpOiBDb2x1bW5bXSB7XG4gICAgICAgIGNvbnN0IGNvbHVtbnM6IENvbHVtbltdID0gW107XG5cbiAgICAgICAgZm9yIChjb25zdCBjb2x1bW5JbmZvIG9mIGRhdGEuUmVzdWx0U2V0LlJlc3VsdFNldE1ldGFkYXRhLkNvbHVtbkluZm8pIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbiA9IG5ldyBDb2x1bW4oKTtcbiAgICAgICAgICAgIGNvbHVtbi5uYW1lID0gY29sdW1uSW5mby5OYW1lO1xuXG4gICAgICAgICAgICBzd2l0Y2ggKGNvbHVtbkluZm8uVHlwZSBhcyBBdGhlbmFEYXRhVHlwZUVudW0pIHtcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5JbnRlZ2VyOlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLlRpbnlJbnQ6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uU21hbGxJbnQ6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uQmlnSW50OlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkZsb2F0OlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkRvdWJsZTpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5EZWNpbWFsOlxuICAgICAgICAgICAgICAgICAgICBjb2x1bW4ucGFyc2UgPSBDb2x1bW4ucGFyc2VOdW1iZXI7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uQ2hhcjpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5WYXJjaGFyOlxuICAgICAgICAgICAgICAgICAgICBjb2x1bW4ucGFyc2UgPSBDb2x1bW4ucGFyc2VTdHJpbmc7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uQm9vbGVhbjpcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uLnBhcnNlID0gQ29sdW1uLnBhcnNlQm9vbGVhbjtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5EYXRlOlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLlRpbWVzdGFtcDpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5UaW1lc3RhbXBXaXRoVHo6XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbi5wYXJzZSA9IENvbHVtbi5wYXJzZURhdGU7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uQXJyYXk6XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbi5wYXJzZSA9IENvbHVtbi5wYXJzZUFycmF5O1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5Kc29uOlxuICAgICAgICAgICAgICAgICAgICBjb2x1bW4ucGFyc2UgPSBDb2x1bW4ucGFyc2VKc29uO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5CaW5hcnk6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uTWFwOlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLlN0cnVjdDpcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENvbHVtbiB0eXBlICcke2NvbHVtbkluZm8uVHlwZX0nIG5vdCBzdXBwb3J0ZWRgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29sdW1ucy5wdXNoKGNvbHVtbik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gY29sdW1ucztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDaGVja3MgdGhlIHF1ZXJ5IGV4ZWN1dGlvbiBzdGF0dXMgdW50aWwgdGhlIHF1ZXJ5IHNlbmRzIFNVQ0NFRURFRCBzaWduYWxcbiAgICAgKlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHBhcmFtIHtRdWVyeX0gcXVlcnkgLSB0aGUgcXVlcnlcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTx2b2lkPn0gLSBwcm9taXNlIHRoYXQgd2lsbCByZXNvbHZlIG9uY2UgdGhlIG9wZXJhdGlvbiBoYXMgZmluaXNoZWRcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHJpdmF0ZSBhc3luYyB3YWl0VW50aWxTdWNjZWVkUXVlcnkocXVlcnk6IFF1ZXJ5KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IHJlcXVlc3RQYXJhbXM6IEF0aGVuYS5UeXBlcy5HZXRRdWVyeUV4ZWN1dGlvbklucHV0ID0ge1xuICAgICAgICAgICAgUXVlcnlFeGVjdXRpb25JZDogcXVlcnkuYXRoZW5hSWQsXG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3Qgd2FpdFRpbWUgPSB0aGlzLmNvbmZpZy53YWl0VGltZSAqIDEwMDA7XG5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGludGVydmFsID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuY2xpZW50LmdldFF1ZXJ5RXhlY3V0aW9uKHJlcXVlc3RQYXJhbXMsIChlcnIsIGRhdGEpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0NoZWNraW5nJyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgcXVlcnkuc3RhdHVzID0gZGF0YS5RdWVyeUV4ZWN1dGlvbi5TdGF0dXMuU3RhdGU7XG5cbiAgICAgICAgICAgICAgICAgICAgc3dpdGNoIChxdWVyeS5zdGF0dXMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ1NVQ0NFRURFRCc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VlZGVkKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdRVUVVRUQnOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnUlVOTklORyc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdDQU5DRUxMRUQnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yZWQobmV3IFF1ZXJ5Q2FuY2VsZWRFeGNlcHRpb24oKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdGQUlMRUQnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yZWQobmV3IEF0aGVuYUNsaWVudEV4Y2VwdGlvbignUXVlcnkgZmFpbGVkJykpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcmVkKG5ldyBBdGhlbmFDbGllbnRFeGNlcHRpb24oYFF1ZXJ5IFN0YXR1cyAnJHtkYXRhLlF1ZXJ5RXhlY3V0aW9uLlN0YXR1cy5TdGF0ZX0nIG5vdCBzdXBwb3J0ZWRgKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIHdhaXRUaW1lKTtcblxuICAgICAgICAgICAgY29uc3Qgc3VjY2VlZGVkID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCd0ZXJtaW5hZG8nKTtcbiAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKGludGVydmFsKTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBlcnJvcmVkID0gKGVycikgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCd0ZXJtaW5hZG8gbWFsJywgZXJyKTtcbiAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKGludGVydmFsKTtcbiAgICAgICAgICAgICAgICByZWplY3QoZXJyKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pO1xuICAgIH1cbn1cbiJdfQ==
