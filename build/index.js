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
                query.results = query.results.concat(this.parseRows(data.ResultSet.Rows, query.columns, isFirstPage));
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

//# sourceMappingURL=data:application/json;charset=utf8;base64,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YSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUN4QixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDaEIsQ0FBQyxDQUFDO1FBQ04sQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0NBQ0o7QUF0WEQsb0NBc1hDIiwiZmlsZSI6ImluZGV4LmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtBdGhlbmF9IGZyb20gJ2F3cy1zZGsnO1xuaW1wb3J0IHtBdGhlbmFDbGllbnRDb25maWd9IGZyb20gJy4vQXRoZW5hQ2xpZW50Q29uZmlnJztcbmltcG9ydCB7UXVldWV9IGZyb20gJy4vUXVldWUnO1xuaW1wb3J0IHtRdWVyeX0gZnJvbSAnLi9RdWVyeSc7XG5pbXBvcnQge0F0aGVuYUNsaWVudEV4Y2VwdGlvbn0gZnJvbSAnLi9leGNlcHRpb24vQXRoZW5hQ2xpZW50RXhjZXB0aW9uJztcbmltcG9ydCB7UXVlcnlDYW5jZWxlZEV4Y2VwdGlvbn0gZnJvbSAnLi9leGNlcHRpb24vUXVlcnlDYW5jZWxlZEV4Y2VwdGlvbic7XG5pbXBvcnQge0NvbHVtbn0gZnJvbSAnLi9Db2x1bW4nO1xuXG5lbnVtIEF0aGVuYURhdGFUeXBlRW51bSB7XG4gICAgSW50ZWdlciA9ICdpbnRlZ2VyJyxcbiAgICBGbG9hdCA9ICdmbG9hdCcsXG4gICAgRG91YmxlID0gJ2RvdWJsZScsXG4gICAgRGVjaW1hbCA9ICdkZWNpbWFsJyxcbiAgICBDaGFyID0gJ2NoYXInLFxuICAgIFZhcmNoYXIgPSAndmFyY2hhcicsXG4gICAgQm9vbGVhbiA9ICdib29sZWFuJyxcbiAgICBCaW5hcnkgPSAnYmluYXJ5JyxcbiAgICBEYXRlID0gJ2RhdGUnLFxuICAgIFRpbWVzdGFtcCA9ICd0aW1lc3RhbXAnLFxuICAgIFRpbWVzdGFtcFdpdGhUeiA9ICd0aW1lc3RhbXAgd2l0aCB0aW1lIHpvbmUnLFxuICAgIEFycmF5ID0gJ2FycmF5JyxcbiAgICBKc29uID0gJ2pzb24nLFxuICAgIE1hcCA9ICdtYXAnLFxuICAgIFN0cnVjdCA9ICdzdHJ1Y3QnLFxuICAgIFRpbnlJbnQgPSAndGlueWludCcsXG4gICAgU21hbGxJbnQgPSAnc21hbGxpbnQnLFxuICAgIEJpZ0ludCA9ICdiaWdpbnQnLFxufVxuXG4vKipcbiAqIEF0aGVuYUNsaWVudCBjbGFzc1xuICpcbiAqIEBleHBvcnRcbiAqIEBjbGFzcyBBdGhlbmFDbGllbnRcbiAqL1xuZXhwb3J0IGNsYXNzIEF0aGVuYUNsaWVudCB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBjbGllbnQ6IEF0aGVuYTtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZzogQXRoZW5hQ2xpZW50Q29uZmlnO1xuXG4gICAgcHJpdmF0ZSBxdWV1ZTogUXVldWU7XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGFuIGluc3RhbmNlIG9mIEF0aGVuYUNsaWVudC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7QXRoZW5hQ2xpZW50Q29uZmlnfSBjb25maWcgLSBDb25maWcgZm9yIEFXUyBBdGhlbmFcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGNvbmZpZzogQXRoZW5hQ2xpZW50Q29uZmlnKSB7XG4gICAgICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICAgICAgICB0aGlzLmNvbmZpZy5hd3NDb25maWcuYXBpVmVyc2lvbiA9ICcyMDE3LTA1LTE4JztcblxuICAgICAgICB0aGlzLmNsaWVudCA9IG5ldyBBdGhlbmEodGhpcy5jb25maWcuYXdzQ29uZmlnKTtcbiAgICAgICAgdGhpcy5xdWV1ZSA9IG5ldyBRdWV1ZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgcXVlcnkgaW4gQXRoZW5hXG4gICAgICpcbiAgICAgKiBAdGVtcGxhdGUgVFxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHNxbCAtIHF1ZXJ5IHRvIGV4ZWN1dGUsIGFzIHN0cmluZ1xuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBwYXJhbWV0ZXJzIC0gcGFyYW1ldGVycyBmb3IgcXVlcnlcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gaWQgLSBZb3VyIGN1c3RvbSBJRFxuICAgICAqXG4gICAgICogQHJldHVybnMge1Byb21pc2U8VFtdPn0gLSBwYXJzZWQgcXVlcnkgcmVzdWx0c1xuICAgICAqXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNsaWVudFxuICAgICAqL1xuICAgIHB1YmxpYyBhc3luYyBleGVjdXRlUXVlcnk8VD4oc3FsOiBzdHJpbmcsIHBhcmFtZXRlcnM/OiBPYmplY3QsIGlkPzogc3RyaW5nKTogUHJvbWlzZTxUW10+IHtcbiAgICAgICAgY29uc3QgcXVlcnkgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeUNvbW1vbihzcWwsIHBhcmFtZXRlcnMsIGlkKTtcblxuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5nZXRRdWVyeVJlc3VsdHMocXVlcnkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgcXVlcnkgaW4gQXRoZW5hIGFuZCBnZXQgUzMgVVJMIHdpdGggQ1NWIGZpbGVcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBzcWwgLSBxdWVyeSB0byBleGVjdXRlLCBhcyBzdHJpbmdcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gcGFyYW1ldGVycyAtIHBhcmFtZXRlcnMgZm9yIHF1ZXJ5XG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGlkIC0gWW91ciBjdXN0b20gSURcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPHN0cmluZz59IC0gUzMgVVJMXG4gICAgICpcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHVibGljIGFzeW5jIGV4ZWN1dGVRdWVyeUFuZEdldFMzVXJsKHNxbDogc3RyaW5nLCBwYXJhbWV0ZXJzPzogT2JqZWN0LCBpZD86IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnlDb21tb24oc3FsLCBwYXJhbWV0ZXJzLCBpZCk7XG4gICAgICAgIGNvbnN0IHMzQnVja2V0VXJpID0gYXdhaXQgdGhpcy5nZXRPdXRwdXRTM0J1Y2tldCgpO1xuXG4gICAgICAgIHJldHVybiBgJHtzM0J1Y2tldFVyaX0ke3F1ZXJ5LmF0aGVuYUlkfS5jc3ZgO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENhbmNlbCBhIEFXUyBBdGhlbmEgcXVlcnlcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBpZCBZb3VyIGN1c3RvbSBJRFxuICAgICAqXG4gICAgICogQHJldHVybnMge1Byb21pc2U8dm9pZD59XG4gICAgICpcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHVibGljIGFzeW5jIGNhbmNlbFF1ZXJ5KGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgcXVlcnkgPSB0aGlzLnF1ZXVlLmdldFF1ZXJ5QnlJZChpZCk7XG4gICAgICAgIGNvbnN0IHJlcXVlc3RQYXJhbXM6IEF0aGVuYS5UeXBlcy5TdG9wUXVlcnlFeGVjdXRpb25JbnB1dCA9IHtcbiAgICAgICAgICAgIFF1ZXJ5RXhlY3V0aW9uSWQ6IHF1ZXJ5LmF0aGVuYUlkLFxuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICB0aGlzLmNsaWVudC5zdG9wUXVlcnlFeGVjdXRpb24ocmVxdWVzdFBhcmFtcywgKGVyciwgZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCBXb3JrR3JvdXAgZGV0YWlsc1xuICAgICAqXG4gICAgICogQHJldHVybnMge1Byb21pc2U8QXRoZW5hLldvcmtHcm91cD59IEFXUyBXb3JrR3JvdXAgT2JqZWN0XG4gICAgICovXG4gICAgcHVibGljIGFzeW5jIGdldFdvcmtHcm91cERldGFpbHMoKTogUHJvbWlzZTxBdGhlbmEuV29ya0dyb3VwPiB7XG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy53b3JrR3JvdXAgPT0gbnVsbCB8fCB0aGlzLmNvbmZpZy53b3JrR3JvdXAgPT09ICcnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1lvdSBtdXN0IGRlZmluZSBhbiBBV1MgQXRoZW5hIFdvcmtHcm91cCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcGFyYW1ldGVyczogQXRoZW5hLkdldFdvcmtHcm91cElucHV0ID0ge1xuICAgICAgICAgICAgV29ya0dyb3VwOiB0aGlzLmNvbmZpZy53b3JrR3JvdXAsXG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPEF0aGVuYS5Xb3JrR3JvdXA+KChyZXNvbHZlOiBGdW5jdGlvbiwgcmVqZWN0OiBGdW5jdGlvbikgPT4ge1xuICAgICAgICAgICAgdGhpcy5jbGllbnQuZ2V0V29ya0dyb3VwKHBhcmFtZXRlcnMsICgoZXJyOiBFcnJvciwgZGF0YTogQXRoZW5hLkdldFdvcmtHcm91cE91dHB1dCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUoZGF0YS5Xb3JrR3JvdXApO1xuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgb3V0cHV0IFMzIGJ1Y2tldCBmcm9tIGJ1Y2tldFVyaSBjb25maWcgcGFyYW1ldGVyIG9yIGZyb20gV29ya0dyb3VwXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxzdHJpbmc+fSBTMyBCdWNrZXQgVVJJXG4gICAgICovXG4gICAgcHVibGljIGFzeW5jIGdldE91dHB1dFMzQnVja2V0KCk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgICAgIGxldCBidWNrZXQ6IHN0cmluZztcblxuICAgICAgICBpZiAodGhpcy5jb25maWcuYnVja2V0VXJpICE9IG51bGwgJiYgdGhpcy5jb25maWcuYnVja2V0VXJpICE9PSAnJykge1xuICAgICAgICAgICAgYnVja2V0ID0gdGhpcy5jb25maWcuYnVja2V0VXJpO1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuY29uZmlnLndvcmtHcm91cCAhPSBudWxsIHx8IHRoaXMuY29uZmlnLndvcmtHcm91cCAhPT0gJycpIHtcbiAgICAgICAgICAgIGNvbnN0IHdvcmtHcm91cCA9IGF3YWl0IHRoaXMuZ2V0V29ya0dyb3VwRGV0YWlscygpO1xuXG4gICAgICAgICAgICBidWNrZXQgPSB3b3JrR3JvdXAuQ29uZmlndXJhdGlvbi5SZXN1bHRDb25maWd1cmF0aW9uLk91dHB1dExvY2F0aW9uO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdZb3UgbXVzdCBkZWZpbmUgYSBTMyBCdWNrZXQgVVJJIGFuZC9vciBhIFdvcmtHcm91cCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGJ1Y2tldDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVRdWVyeUNvbW1vbihzcWw6IHN0cmluZywgcGFyYW1ldGVycz86IE9iamVjdCwgaWQ/OiBzdHJpbmcpOiBQcm9taXNlPFF1ZXJ5PiB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gbmV3IFF1ZXJ5KHNxbCwgcGFyYW1ldGVycywgaWQpO1xuXG4gICAgICAgIHRoaXMucXVldWUuYWRkUXVlcnkocXVlcnkpO1xuXG4gICAgICAgIHF1ZXJ5LmF0aGVuYUlkID0gYXdhaXQgdGhpcy5zdGFydFF1ZXJ5RXhlY3V0aW9uKHF1ZXJ5KTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy53YWl0VW50aWxTdWNjZWVkUXVlcnkocXVlcnkpO1xuICAgICAgICB9IGNhdGNoIChleGNlcHRpb24pIHtcbiAgICAgICAgICAgIHRoaXMucXVldWUucmVtb3ZlUXVlcnkocXVlcnkpO1xuXG4gICAgICAgICAgICB0aHJvdyBleGNlcHRpb247XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3RhcnRzIHF1ZXJ5IGV4ZWN1dGlvbiBhbmQgZ2V0cyBhbiBJRCBmb3IgdGhlIG9wZXJhdGlvblxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAcGFyYW0ge1F1ZXJ5fSBxdWVyeSAtIEF0aGVuYSByZXF1ZXN0IHBhcmFtc1xuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPHN0cmluZz59IC0gcXVlcnkgZXhlY3V0aW9uIGlkXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNsaWVudFxuICAgICAqL1xuICAgIHByaXZhdGUgYXN5bmMgc3RhcnRRdWVyeUV4ZWN1dGlvbihxdWVyeTogUXVlcnkpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgICAgICBjb25zdCByZXF1ZXN0UGFyYW1zOiBBdGhlbmEuVHlwZXMuU3RhcnRRdWVyeUV4ZWN1dGlvbklucHV0ID0ge1xuICAgICAgICAgICAgUXVlcnlFeGVjdXRpb25Db250ZXh0OiB7XG4gICAgICAgICAgICAgICAgRGF0YWJhc2U6IHRoaXMuY29uZmlnLmRhdGFiYXNlLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFF1ZXJ5U3RyaW5nOiBxdWVyeS5zcWwsXG4gICAgICAgICAgICBSZXN1bHRDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgICAgICAgT3V0cHV0TG9jYXRpb246IHRoaXMuY29uZmlnLmJ1Y2tldFVyaSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKHRoaXMuY29uZmlnLndvcmtHcm91cCAhPSBudWxsKSB7XG4gICAgICAgICAgICByZXF1ZXN0UGFyYW1zLldvcmtHcm91cCA9IHRoaXMuY29uZmlnLndvcmtHcm91cDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTxzdHJpbmc+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRoaXMuY2xpZW50LnN0YXJ0UXVlcnlFeGVjdXRpb24ocmVxdWVzdFBhcmFtcywgKGVyciwgZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUoZGF0YS5RdWVyeUV4ZWN1dGlvbklkKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQcm9jZXNzZXMgcXVlcnkgcmVzdWx0cyBhbmQgcGFyc2VzIHRoZW1cbiAgICAgKlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHRlbXBsYXRlIFRcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7UXVlcnk8VD59IHF1ZXJ5XG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5leHRUb2tlblxuICAgICAqIEBwYXJhbSB7VFtdfSBwcmV2aW91c1Jlc3VsdHNcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPFRbXT59IC0gcGFyc2VkIHF1ZXJ5IHJlc3VsdCByb3dzXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNsaWVudFxuICAgICAqL1xuICAgIHByaXZhdGUgZ2V0UXVlcnlSZXN1bHRzPFQ+KHF1ZXJ5OiBRdWVyeTxUPiwgbmV4dFRva2VuPzogc3RyaW5nLCBwcmV2aW91c1Jlc3VsdHM/OiBUW10pOiBQcm9taXNlPFRbXT4ge1xuICAgICAgICBjb25zdCByZXF1ZXN0UGFyYW1zOiBBdGhlbmEuVHlwZXMuR2V0UXVlcnlSZXN1bHRzSW5wdXQgPSB7XG4gICAgICAgICAgICBOZXh0VG9rZW46IG5leHRUb2tlbixcbiAgICAgICAgICAgIFF1ZXJ5RXhlY3V0aW9uSWQ6IHF1ZXJ5LmF0aGVuYUlkLFxuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTxUW10+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRoaXMuY2xpZW50LmdldFF1ZXJ5UmVzdWx0cyhyZXF1ZXN0UGFyYW1zLCBhc3luYyAoZXJyLCBkYXRhKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGVyciAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoIXF1ZXJ5Lmhhc0NvbHVtbnMoKSkge1xuICAgICAgICAgICAgICAgICAgICBxdWVyeS5jb2x1bW5zID0gdGhpcy5zZXRDb2x1bW5QYXJzZXJzKGRhdGEpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IGlzRmlyc3RQYWdlID0gIXF1ZXJ5Lmhhc1Jlc3VsdHMoKSAmJiBuZXh0VG9rZW4gPT0gbnVsbDtcblxuICAgICAgICAgICAgICAgIHF1ZXJ5LnJlc3VsdHMgPSBxdWVyeS5yZXN1bHRzLmNvbmNhdCh0aGlzLnBhcnNlUm93czxUPihkYXRhLlJlc3VsdFNldC5Sb3dzLCBxdWVyeS5jb2x1bW5zLCBpc0ZpcnN0UGFnZSkpO1xuXG4gICAgICAgICAgICAgICAgaWYgKGRhdGEuTmV4dFRva2VuICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcXVlcnkucmVzdWx0cyA9IGF3YWl0IHRoaXMuZ2V0UXVlcnlSZXN1bHRzPFQ+KHF1ZXJ5LCBkYXRhLk5leHRUb2tlbik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShxdWVyeS5yZXN1bHRzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQYXJzZXMgcmVzdWx0IHJvd3NcbiAgICAgKlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHRlbXBsYXRlIFRcbiAgICAgKiBAcGFyYW0ge0F0aGVuYS5Sb3dbXX0gcm93cyAtIHF1ZXJ5IHJlc3VsdCByb3dzXG4gICAgICogQHBhcmFtIHtDb2x1bW5bXX0gY29sdW1ucyAtIHF1ZXJ5IHJlc3VsdCBjb2x1bW5zXG4gICAgICogQHBhcmFtIHtib29sZWFufSBpc0ZpcnN0UGFnZVxuICAgICAqIEByZXR1cm5zIHtUW119IC0gcGFyc2VkIHJlc3VsdCBhY2NvcmRpbmcgdG8gbmVlZGVkIHBhcnNlclxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDbGllbnRcbiAgICAgKi9cbiAgICBwcml2YXRlIHBhcnNlUm93czxUPihyb3dzOiBBdGhlbmEuUm93W10sIGNvbHVtbnM6IENvbHVtbltdLCBpc0ZpcnN0UGFnZSA9IGZhbHNlKTogVFtdIHtcbiAgICAgICAgY29uc3QgcmVzdWx0czogVFtdID0gW107XG5cbiAgICAgICAgLy8gU3RhcnQgd2l0aCAxIHdoZW4gZmlyc3QgbGluZSBpcyBjb2x1bW4gdGl0bGUgKGluIGZpcnN0IHBhZ2UpXG4gICAgICAgIGZvciAobGV0IHJvd0luZGV4ID0gKGlzRmlyc3RQYWdlKSA/IDEgOiAwOyByb3dJbmRleCA8IHJvd3MubGVuZ3RoOyByb3dJbmRleCsrKSB7XG4gICAgICAgICAgICBjb25zdCByb3cgPSByb3dzW3Jvd0luZGV4XTtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogVCA9IDxUPnt9O1xuXG4gICAgICAgICAgICBmb3IgKGxldCByb3dEYXRhSW5kZXggPSAwOyByb3dEYXRhSW5kZXggPCByb3cuRGF0YS5sZW5ndGg7IHJvd0RhdGFJbmRleCsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgcm93RGF0YSA9IHJvdy5EYXRhW3Jvd0RhdGFJbmRleF07XG4gICAgICAgICAgICAgICAgY29uc3QgY29sdW1uID0gY29sdW1uc1tyb3dEYXRhSW5kZXhdO1xuXG4gICAgICAgICAgICAgICAgaWYgKHJvd0RhdGEgIT0gbnVsbCAmJiByb3dEYXRhLlZhckNoYXJWYWx1ZSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdFtjb2x1bW4ubmFtZV0gPSBjb2x1bW4ucGFyc2Uocm93RGF0YS5WYXJDaGFyVmFsdWUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdFtjb2x1bW4ubmFtZV0gPSBudWxsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVzdWx0cy5wdXNoKHJlc3VsdCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXQgYXBwcm9wcmlhdGUgY29sdW1uIHBhcnNlcnMgYWNjb3JkaW5nIHRvIGNvbHVtbnMnIGRhdGEgdHlwZVxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAcGFyYW0geyp9IGRhdGEgLSBxdWVyeSByZXN1bHRzXG4gICAgICogQHJldHVybnMge0NvbHVtbltdfSAtIGNvbHVtbiBuYW1lIGFuZCBwYXJzZXIgdHlwZVxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDbGllbnRcbiAgICAgKi9cbiAgICBwcml2YXRlIHNldENvbHVtblBhcnNlcnMoZGF0YSk6IENvbHVtbltdIHtcbiAgICAgICAgY29uc3QgY29sdW1uczogQ29sdW1uW10gPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IGNvbHVtbkluZm8gb2YgZGF0YS5SZXN1bHRTZXQuUmVzdWx0U2V0TWV0YWRhdGEuQ29sdW1uSW5mbykge1xuICAgICAgICAgICAgY29uc3QgY29sdW1uID0gbmV3IENvbHVtbigpO1xuICAgICAgICAgICAgY29sdW1uLm5hbWUgPSBjb2x1bW5JbmZvLk5hbWU7XG5cbiAgICAgICAgICAgIHN3aXRjaCAoY29sdW1uSW5mby5UeXBlIGFzIEF0aGVuYURhdGFUeXBlRW51bSkge1xuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkludGVnZXI6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uVGlueUludDpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5TbWFsbEludDpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5CaWdJbnQ6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uRmxvYXQ6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uRG91YmxlOlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkRlY2ltYWw6XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbi5wYXJzZSA9IENvbHVtbi5wYXJzZU51bWJlcjtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5DaGFyOlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLlZhcmNoYXI6XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbi5wYXJzZSA9IENvbHVtbi5wYXJzZVN0cmluZztcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5Cb29sZWFuOlxuICAgICAgICAgICAgICAgICAgICBjb2x1bW4ucGFyc2UgPSBDb2x1bW4ucGFyc2VCb29sZWFuO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkRhdGU6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uVGltZXN0YW1wOlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLlRpbWVzdGFtcFdpdGhUejpcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uLnBhcnNlID0gQ29sdW1uLnBhcnNlRGF0ZTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5BcnJheTpcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uLnBhcnNlID0gQ29sdW1uLnBhcnNlQXJyYXk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkpzb246XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbi5wYXJzZSA9IENvbHVtbi5wYXJzZUpzb247XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkJpbmFyeTpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5NYXA6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uU3RydWN0OlxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ29sdW1uIHR5cGUgJyR7Y29sdW1uSW5mby5UeXBlfScgbm90IHN1cHBvcnRlZGApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb2x1bW5zLnB1c2goY29sdW1uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBjb2x1bW5zO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENoZWNrcyB0aGUgcXVlcnkgZXhlY3V0aW9uIHN0YXR1cyB1bnRpbCB0aGUgcXVlcnkgc2VuZHMgU1VDQ0VFREVEIHNpZ25hbFxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAcGFyYW0ge1F1ZXJ5fSBxdWVyeSAtIHRoZSBxdWVyeVxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fSAtIHByb21pc2UgdGhhdCB3aWxsIHJlc29sdmUgb25jZSB0aGUgb3BlcmF0aW9uIGhhcyBmaW5pc2hlZFxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDbGllbnRcbiAgICAgKi9cbiAgICBwcml2YXRlIGFzeW5jIHdhaXRVbnRpbFN1Y2NlZWRRdWVyeShxdWVyeTogUXVlcnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgcmVxdWVzdFBhcmFtczogQXRoZW5hLlR5cGVzLkdldFF1ZXJ5RXhlY3V0aW9uSW5wdXQgPSB7XG4gICAgICAgICAgICBRdWVyeUV4ZWN1dGlvbklkOiBxdWVyeS5hdGhlbmFJZCxcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCB3YWl0VGltZSA9IHRoaXMuY29uZmlnLndhaXRUaW1lICogMTAwMDtcblxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgaW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5jbGllbnQuZ2V0UXVlcnlFeGVjdXRpb24ocmVxdWVzdFBhcmFtcywgKGVyciwgZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXJyICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LnN0YXR1cyA9IGRhdGEuUXVlcnlFeGVjdXRpb24uU3RhdHVzLlN0YXRlO1xuXG4gICAgICAgICAgICAgICAgICAgIHN3aXRjaCAocXVlcnkuc3RhdHVzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdTVUNDRUVERUQnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2NlZWRlZCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnUVVFVUVEJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ1JVTk5JTkcnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnQ0FOQ0VMTEVEJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcmVkKG5ldyBRdWVyeUNhbmNlbGVkRXhjZXB0aW9uKCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnRkFJTEVEJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcmVkKG5ldyBBdGhlbmFDbGllbnRFeGNlcHRpb24oJ1F1ZXJ5IGZhaWxlZCcpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3JlZChuZXcgQXRoZW5hQ2xpZW50RXhjZXB0aW9uKGBRdWVyeSBTdGF0dXMgJyR7ZGF0YS5RdWVyeUV4ZWN1dGlvbi5TdGF0dXMuU3RhdGV9JyBub3Qgc3VwcG9ydGVkYCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCB3YWl0VGltZSk7XG5cbiAgICAgICAgICAgIGNvbnN0IHN1Y2NlZWRlZCA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKGludGVydmFsKTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBlcnJvcmVkID0gKGVycikgPT4ge1xuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwoaW50ZXJ2YWwpO1xuICAgICAgICAgICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgfVxufVxuIl19
