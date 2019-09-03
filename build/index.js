'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const aws_sdk_1 = require("aws-sdk");
const Queue_1 = require("./Queue");
const Query_1 = require("./Query");
const AthenaClientException_1 = require("./exception/AthenaClientException");
const QueryCanceledException_1 = require("./exception/QueryCanceledException");
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
        return await this.getQueryResults(query.athenaId);
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
    getQueryResults(queryExecutionId, nextToken, previousResults) {
        const requestParams = {
            NextToken: nextToken,
            QueryExecutionId: queryExecutionId,
        };
        let columns;
        return new Promise((resolve, reject) => {
            this.client.getQueryResults(requestParams, async (err, data) => {
                if (err != null) {
                    return reject(err);
                }
                columns = this.setColumnParsers(data);
                const isFirstPage = (previousResults == null && nextToken == null);
                let results = this.parseRows(data.ResultSet.Rows, columns, isFirstPage);
                if (previousResults != null) {
                    results = previousResults.concat(results);
                }
                if (data.NextToken != null) {
                    results = await this.getQueryResults(queryExecutionId, data.NextToken, results);
                }
                resolve(results);
            });
        });
    }
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
     * @returns {AthenaColumn[]} - column name and parser type
     * @memberof AthenaClient
     */
    setColumnParsers(data) {
        const columns = [];
        for (const columnInfo of data.ResultSet.ResultSetMetadata.ColumnInfo) {
            const column = new AthenaColumn();
            column.name = columnInfo.Name;
            switch (columnInfo.Type) {
                case AthenaDataTypeEnum.Integer:
                case AthenaDataTypeEnum.TinyInt:
                case AthenaDataTypeEnum.SmallInt:
                case AthenaDataTypeEnum.BigInt:
                case AthenaDataTypeEnum.Float:
                case AthenaDataTypeEnum.Double:
                case AthenaDataTypeEnum.Decimal:
                    column.parse = AthenaColumn.parseNumber;
                    break;
                case AthenaDataTypeEnum.Char:
                case AthenaDataTypeEnum.Varchar:
                    column.parse = AthenaColumn.parseString;
                    break;
                case AthenaDataTypeEnum.Boolean:
                    column.parse = AthenaColumn.parseBoolean;
                    break;
                case AthenaDataTypeEnum.Date:
                case AthenaDataTypeEnum.Timestamp:
                case AthenaDataTypeEnum.TimestampWithTz:
                    column.parse = AthenaColumn.parseDate;
                    break;
                case AthenaDataTypeEnum.Array:
                    column.parse = AthenaColumn.parseArray;
                    break;
                case AthenaDataTypeEnum.Json:
                    column.parse = AthenaColumn.parseJson;
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
        return new Promise((resolve, reject) => {
            this.client.getQueryExecution(requestParams, async (err, data) => {
                if (err != null) {
                    return reject(err);
                }
                query.status = data.QueryExecution.Status.State;
                switch (query.status) {
                    case 'SUCCEEDED':
                        resolve();
                        break;
                    case 'QUEUED':
                    case 'RUNNING':
                        setTimeout(async () => {
                            try {
                                await this.waitUntilSucceedQuery(query);
                                resolve();
                            }
                            catch (e) {
                                reject(e);
                            }
                        }, this.config.waitTime * 1000);
                        break;
                    case 'CANCELLED':
                        reject(new QueryCanceledException_1.QueryCanceledException());
                        break;
                    case 'FAILED':
                        reject(new AthenaClientException_1.AthenaClientException('Query failed'));
                        break;
                    default:
                        reject(new AthenaClientException_1.AthenaClientException(`Query Status '${data.QueryExecution.Status.State}' not supported`));
                        break;
                }
            });
        });
    }
}
exports.AthenaClient = AthenaClient;
/**
 * AthenaColumn class
 *
 * @class AthenaColumn
 */
class AthenaColumn {
    /**
     * Parses string to number
     *
     * @static
     * @param {string} value - string to parse
     * @returns {number} - parsed number
     * @memberof AthenaColumn
     */
    static parseNumber(value) {
        const result = Number(value);
        if (isNaN(result)) {
            throw new Error(`The value '${value} 'is not a number`);
        }
        return result;
    }
    /**
     * Parses string
     *
     * @static
     * @param {string} value - string to parse
     * @returns {string} - parsed string
     * @memberof AthenaColumn
     */
    static parseString(value) {
        return value;
    }
    /**
     * Parses boolean-like Athena expression to boolean
     *
     * @static
     * @param {string} value - boolean-like string
     * @returns {boolean} - parsed string
     * @memberof AthenaColumn
     */
    static parseBoolean(value) {
        return (value === 'true'
            || value === 'TRUE'
            || value === 't'
            || value === 'T'
            || value === 'yes'
            || value === 'YES'
            || value === '1');
    }
    /**
     * Parses string to date
     *
     * @static
     * @param {string} value - string to parse
     * @returns {Date} - parsed date
     * @memberof AthenaColumn
     */
    static parseDate(value) {
        return new Date(value);
    }
    /**
     * Parses string to array
     *
     * @static
     * @param {string} arrayInString - string to parse
     * @returns {any[]} - parsed array
     * @memberof AthenaColumn
     */
    static parseArray(arrayInString) {
        arrayInString = arrayInString.replace(/\[|\]/gi, '');
        const values = arrayInString.split(', ');
        const result = [];
        for (const value of values) {
            let numberValue = Number(value);
            if (!Number.isNaN(numberValue)) {
                result.push(numberValue);
            }
            else {
                result.push(value);
            }
        }
        return result;
    }
    /**
     * Parses string to array
     *
     * @static
     * @param {string} value - string to parse
     * @returns {any[]} - parsed array
     * @memberof AthenaColumn
     */
    static parseJson(value) {
        return JSON.parse(value);
    }
}

//# sourceMappingURL=data:application/json;charset=utf8;base64,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QUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRWhDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxFQUFFO2dCQUM1QixNQUFNLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO2FBQzVCO2lCQUFNO2dCQUNILE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7YUFDdEI7U0FDSjtRQUVELE9BQU8sTUFBTSxDQUFDO0lBQ2xCLENBQUM7SUFFRDs7Ozs7OztPQU9HO0lBQ0ksTUFBTSxDQUFDLFNBQVMsQ0FBQyxLQUFhO1FBQ2pDLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM3QixDQUFDO0NBQ0oiLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHN0cmljdCc7XG5cbmltcG9ydCB7QXRoZW5hfSBmcm9tICdhd3Mtc2RrJztcbmltcG9ydCB7QXRoZW5hQ2xpZW50Q29uZmlnfSBmcm9tICcuL0F0aGVuYUNsaWVudENvbmZpZyc7XG5pbXBvcnQge1F1ZXVlfSBmcm9tICcuL1F1ZXVlJztcbmltcG9ydCB7UXVlcnl9IGZyb20gJy4vUXVlcnknO1xuaW1wb3J0IHtBdGhlbmFDbGllbnRFeGNlcHRpb259IGZyb20gJy4vZXhjZXB0aW9uL0F0aGVuYUNsaWVudEV4Y2VwdGlvbic7XG5pbXBvcnQge1F1ZXJ5Q2FuY2VsZWRFeGNlcHRpb259IGZyb20gJy4vZXhjZXB0aW9uL1F1ZXJ5Q2FuY2VsZWRFeGNlcHRpb24nO1xuXG5lbnVtIEF0aGVuYURhdGFUeXBlRW51bSB7XG4gICAgSW50ZWdlciA9ICdpbnRlZ2VyJyxcbiAgICBGbG9hdCA9ICdmbG9hdCcsXG4gICAgRG91YmxlID0gJ2RvdWJsZScsXG4gICAgRGVjaW1hbCA9ICdkZWNpbWFsJyxcbiAgICBDaGFyID0gJ2NoYXInLFxuICAgIFZhcmNoYXIgPSAndmFyY2hhcicsXG4gICAgQm9vbGVhbiA9ICdib29sZWFuJyxcbiAgICBCaW5hcnkgPSAnYmluYXJ5JyxcbiAgICBEYXRlID0gJ2RhdGUnLFxuICAgIFRpbWVzdGFtcCA9ICd0aW1lc3RhbXAnLFxuICAgIFRpbWVzdGFtcFdpdGhUeiA9ICd0aW1lc3RhbXAgd2l0aCB0aW1lIHpvbmUnLFxuICAgIEFycmF5ID0gJ2FycmF5JyxcbiAgICBKc29uID0gJ2pzb24nLFxuICAgIE1hcCA9ICdtYXAnLFxuICAgIFN0cnVjdCA9ICdzdHJ1Y3QnLFxuICAgIFRpbnlJbnQgPSAndGlueWludCcsXG4gICAgU21hbGxJbnQgPSAnc21hbGxpbnQnLFxuICAgIEJpZ0ludCA9ICdiaWdpbnQnLFxufVxuXG4vKipcbiAqIEF0aGVuYUNsaWVudCBjbGFzc1xuICpcbiAqIEBleHBvcnRcbiAqIEBjbGFzcyBBdGhlbmFDbGllbnRcbiAqL1xuZXhwb3J0IGNsYXNzIEF0aGVuYUNsaWVudCB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBjbGllbnQ6IEF0aGVuYTtcblxuICAgIHByaXZhdGUgcmVhZG9ubHkgY29uZmlnOiBBdGhlbmFDbGllbnRDb25maWc7XG5cbiAgICBwcml2YXRlIHF1ZXVlOiBRdWV1ZTtcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYW4gaW5zdGFuY2Ugb2YgQXRoZW5hQ2xpZW50LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtBdGhlbmFDbGllbnRDb25maWd9IGNvbmZpZyAtIENvbmZpZyBmb3IgQVdTIEF0aGVuYVxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDbGllbnRcbiAgICAgKi9cbiAgICBwdWJsaWMgY29uc3RydWN0b3IoY29uZmlnOiBBdGhlbmFDbGllbnRDb25maWcpIHtcbiAgICAgICAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gICAgICAgIHRoaXMuY29uZmlnLmF3c0NvbmZpZy5hcGlWZXJzaW9uID0gJzIwMTctMDUtMTgnO1xuXG4gICAgICAgIHRoaXMuY2xpZW50ID0gbmV3IEF0aGVuYSh0aGlzLmNvbmZpZy5hd3NDb25maWcpO1xuICAgICAgICB0aGlzLnF1ZXVlID0gbmV3IFF1ZXVlKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBxdWVyeSBpbiBBdGhlbmFcbiAgICAgKlxuICAgICAqIEB0ZW1wbGF0ZSBUXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gc3FsIC0gcXVlcnkgdG8gZXhlY3V0ZSwgYXMgc3RyaW5nXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHBhcmFtZXRlcnMgLSBwYXJhbWV0ZXJzIGZvciBxdWVyeVxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBpZCAtIFlvdXIgY3VzdG9tIElEXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxUW10+fSAtIHBhcnNlZCBxdWVyeSByZXN1bHRzXG4gICAgICpcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHVibGljIGFzeW5jIGV4ZWN1dGVRdWVyeTxUPihzcWw6IHN0cmluZywgcGFyYW1ldGVycz86IE9iamVjdCwgaWQ/OiBzdHJpbmcpOiBQcm9taXNlPFRbXT4ge1xuICAgICAgICBjb25zdCBxdWVyeSA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5Q29tbW9uKHNxbCwgcGFyYW1ldGVycywgaWQpO1xuXG4gICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmdldFF1ZXJ5UmVzdWx0cyhxdWVyeS5hdGhlbmFJZCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBxdWVyeSBpbiBBdGhlbmEgYW5kIGdldCBTMyBVUkwgd2l0aCBDU1YgZmlsZVxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHNxbCAtIHF1ZXJ5IHRvIGV4ZWN1dGUsIGFzIHN0cmluZ1xuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBwYXJhbWV0ZXJzIC0gcGFyYW1ldGVycyBmb3IgcXVlcnlcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gaWQgLSBZb3VyIGN1c3RvbSBJRFxuICAgICAqXG4gICAgICogQHJldHVybnMge1Byb21pc2U8c3RyaW5nPn0gLSBTMyBVUkxcbiAgICAgKlxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDbGllbnRcbiAgICAgKi9cbiAgICBwdWJsaWMgYXN5bmMgZXhlY3V0ZVF1ZXJ5QW5kR2V0UzNVcmwoc3FsOiBzdHJpbmcsIHBhcmFtZXRlcnM/OiBPYmplY3QsIGlkPzogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICAgICAgY29uc3QgcXVlcnkgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeUNvbW1vbihzcWwsIHBhcmFtZXRlcnMsIGlkKTtcbiAgICAgICAgY29uc3QgczNCdWNrZXRVcmkgPSBhd2FpdCB0aGlzLmdldE91dHB1dFMzQnVja2V0KCk7XG5cbiAgICAgICAgcmV0dXJuIGAke3MzQnVja2V0VXJpfSR7cXVlcnkuYXRoZW5hSWR9LmNzdmA7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2FuY2VsIGEgQVdTIEF0aGVuYSBxdWVyeVxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGlkIFlvdXIgY3VzdG9tIElEXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTx2b2lkPn1cbiAgICAgKlxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDbGllbnRcbiAgICAgKi9cbiAgICBwdWJsaWMgYXN5bmMgY2FuY2VsUXVlcnkoaWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCBxdWVyeSA9IHRoaXMucXVldWUuZ2V0UXVlcnlCeUlkKGlkKTtcbiAgICAgICAgY29uc3QgcmVxdWVzdFBhcmFtczogQXRoZW5hLlR5cGVzLlN0b3BRdWVyeUV4ZWN1dGlvbklucHV0ID0ge1xuICAgICAgICAgICAgUXVlcnlFeGVjdXRpb25JZDogcXVlcnkuYXRoZW5hSWQsXG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRoaXMuY2xpZW50LnN0b3BRdWVyeUV4ZWN1dGlvbihyZXF1ZXN0UGFyYW1zLCAoZXJyLCBkYXRhKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGVyciAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IFdvcmtHcm91cCBkZXRhaWxzXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxBdGhlbmEuV29ya0dyb3VwPn0gQVdTIFdvcmtHcm91cCBPYmplY3RcbiAgICAgKi9cbiAgICBwdWJsaWMgYXN5bmMgZ2V0V29ya0dyb3VwRGV0YWlscygpOiBQcm9taXNlPEF0aGVuYS5Xb3JrR3JvdXA+IHtcbiAgICAgICAgaWYgKHRoaXMuY29uZmlnLndvcmtHcm91cCA9PSBudWxsIHx8IHRoaXMuY29uZmlnLndvcmtHcm91cCA9PT0gJycpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignWW91IG11c3QgZGVmaW5lIGFuIEFXUyBBdGhlbmEgV29ya0dyb3VwJyk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwYXJhbWV0ZXJzOiBBdGhlbmEuR2V0V29ya0dyb3VwSW5wdXQgPSB7XG4gICAgICAgICAgICBXb3JrR3JvdXA6IHRoaXMuY29uZmlnLndvcmtHcm91cCxcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8QXRoZW5hLldvcmtHcm91cD4oKHJlc29sdmU6IEZ1bmN0aW9uLCByZWplY3Q6IEZ1bmN0aW9uKSA9PiB7XG4gICAgICAgICAgICB0aGlzLmNsaWVudC5nZXRXb3JrR3JvdXAocGFyYW1ldGVycywgKChlcnI6IEVycm9yLCBkYXRhOiBBdGhlbmEuR2V0V29ya0dyb3VwT3V0cHV0KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGVyciAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZShkYXRhLldvcmtHcm91cCk7XG4gICAgICAgICAgICB9KSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCBvdXRwdXQgUzMgYnVja2V0IGZyb20gYnVja2V0VXJpIGNvbmZpZyBwYXJhbWV0ZXIgb3IgZnJvbSBXb3JrR3JvdXBcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPHN0cmluZz59IFMzIEJ1Y2tldCBVUklcbiAgICAgKi9cbiAgICBwdWJsaWMgYXN5bmMgZ2V0T3V0cHV0UzNCdWNrZXQoKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICAgICAgbGV0IGJ1Y2tldDogc3RyaW5nO1xuXG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy5idWNrZXRVcmkgIT0gbnVsbCAmJiB0aGlzLmNvbmZpZy5idWNrZXRVcmkgIT09ICcnKSB7XG4gICAgICAgICAgICBidWNrZXQgPSB0aGlzLmNvbmZpZy5idWNrZXRVcmk7XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5jb25maWcud29ya0dyb3VwICE9IG51bGwgfHwgdGhpcy5jb25maWcud29ya0dyb3VwICE9PSAnJykge1xuICAgICAgICAgICAgY29uc3Qgd29ya0dyb3VwID0gYXdhaXQgdGhpcy5nZXRXb3JrR3JvdXBEZXRhaWxzKCk7XG5cbiAgICAgICAgICAgIGJ1Y2tldCA9IHdvcmtHcm91cC5Db25maWd1cmF0aW9uLlJlc3VsdENvbmZpZ3VyYXRpb24uT3V0cHV0TG9jYXRpb247XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1lvdSBtdXN0IGRlZmluZSBhIFMzIEJ1Y2tldCBVUkkgYW5kL29yIGEgV29ya0dyb3VwJyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYnVja2V0O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZXhlY3V0ZVF1ZXJ5Q29tbW9uKHNxbDogc3RyaW5nLCBwYXJhbWV0ZXJzPzogT2JqZWN0LCBpZD86IHN0cmluZyk6IFByb21pc2U8UXVlcnk+IHtcbiAgICAgICAgY29uc3QgcXVlcnkgPSBuZXcgUXVlcnkoc3FsLCBwYXJhbWV0ZXJzLCBpZCk7XG5cbiAgICAgICAgdGhpcy5xdWV1ZS5hZGRRdWVyeShxdWVyeSk7XG5cbiAgICAgICAgcXVlcnkuYXRoZW5hSWQgPSBhd2FpdCB0aGlzLnN0YXJ0UXVlcnlFeGVjdXRpb24ocXVlcnkpO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLndhaXRVbnRpbFN1Y2NlZWRRdWVyeShxdWVyeSk7XG4gICAgICAgIH0gY2F0Y2ggKGV4Y2VwdGlvbikge1xuICAgICAgICAgICAgdGhpcy5xdWV1ZS5yZW1vdmVRdWVyeShxdWVyeSk7XG5cbiAgICAgICAgICAgIHRocm93IGV4Y2VwdGlvbjtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdGFydHMgcXVlcnkgZXhlY3V0aW9uIGFuZCBnZXRzIGFuIElEIGZvciB0aGUgb3BlcmF0aW9uXG4gICAgICpcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqIEBwYXJhbSB7UXVlcnl9IHF1ZXJ5IC0gQXRoZW5hIHJlcXVlc3QgcGFyYW1zXG4gICAgICogQHJldHVybnMge1Byb21pc2U8c3RyaW5nPn0gLSBxdWVyeSBleGVjdXRpb24gaWRcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHJpdmF0ZSBhc3luYyBzdGFydFF1ZXJ5RXhlY3V0aW9uKHF1ZXJ5OiBRdWVyeSk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgICAgIGNvbnN0IHJlcXVlc3RQYXJhbXM6IEF0aGVuYS5UeXBlcy5TdGFydFF1ZXJ5RXhlY3V0aW9uSW5wdXQgPSB7XG4gICAgICAgICAgICBRdWVyeUV4ZWN1dGlvbkNvbnRleHQ6IHtcbiAgICAgICAgICAgICAgICBEYXRhYmFzZTogdGhpcy5jb25maWcuZGF0YWJhc2UsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgUXVlcnlTdHJpbmc6IHF1ZXJ5LnNxbCxcbiAgICAgICAgICAgIFJlc3VsdENvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICAgICAgICBPdXRwdXRMb2NhdGlvbjogdGhpcy5jb25maWcuYnVja2V0VXJpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAodGhpcy5jb25maWcud29ya0dyb3VwICE9IG51bGwpIHtcbiAgICAgICAgICAgIHJlcXVlc3RQYXJhbXMuV29ya0dyb3VwID0gdGhpcy5jb25maWcud29ya0dyb3VwO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHN0cmluZz4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5jbGllbnQuc3RhcnRRdWVyeUV4ZWN1dGlvbihyZXF1ZXN0UGFyYW1zLCAoZXJyLCBkYXRhKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGVyciAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZShkYXRhLlF1ZXJ5RXhlY3V0aW9uSWQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFByb2Nlc3NlcyBxdWVyeSByZXN1bHRzIGFuZCBwYXJzZXMgdGhlbVxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAdGVtcGxhdGUgVFxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHF1ZXJ5RXhlY3V0aW9uSWQgLSBxdWVyeSBleGVjdXRpb24gaWRlbnRpZmllclxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuZXh0VG9rZW5cbiAgICAgKiBAcGFyYW0ge1RbXX0gcHJldmlvdXNSZXN1bHRzXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxUW10+fSAtIHBhcnNlZCBxdWVyeSByZXN1bHQgcm93c1xuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDbGllbnRcbiAgICAgKi9cbiAgICBwcml2YXRlIGdldFF1ZXJ5UmVzdWx0czxUPihxdWVyeUV4ZWN1dGlvbklkOiBzdHJpbmcsIG5leHRUb2tlbj86IHN0cmluZywgcHJldmlvdXNSZXN1bHRzPzogVFtdKTogUHJvbWlzZTxUW10+IHtcbiAgICAgICAgY29uc3QgcmVxdWVzdFBhcmFtczogQXRoZW5hLlR5cGVzLkdldFF1ZXJ5UmVzdWx0c0lucHV0ID0ge1xuICAgICAgICAgICAgTmV4dFRva2VuOiBuZXh0VG9rZW4sXG4gICAgICAgICAgICBRdWVyeUV4ZWN1dGlvbklkOiBxdWVyeUV4ZWN1dGlvbklkLFxuICAgICAgICB9O1xuXG4gICAgICAgIGxldCBjb2x1bW5zOiBBdGhlbmFDb2x1bW5bXTtcblxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8YW55PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICB0aGlzLmNsaWVudC5nZXRRdWVyeVJlc3VsdHMocmVxdWVzdFBhcmFtcywgYXN5bmMgKGVyciwgZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29sdW1ucyA9IHRoaXMuc2V0Q29sdW1uUGFyc2VycyhkYXRhKTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IGlzRmlyc3RQYWdlID0gKHByZXZpb3VzUmVzdWx0cyA9PSBudWxsICYmIG5leHRUb2tlbiA9PSBudWxsKTtcblxuICAgICAgICAgICAgICAgIGxldCByZXN1bHRzID0gdGhpcy5wYXJzZVJvd3M8VD4oZGF0YS5SZXN1bHRTZXQuUm93cywgY29sdW1ucywgaXNGaXJzdFBhZ2UpO1xuXG4gICAgICAgICAgICAgICAgaWYgKHByZXZpb3VzUmVzdWx0cyAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdHMgPSBwcmV2aW91c1Jlc3VsdHMuY29uY2F0KHJlc3VsdHMpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChkYXRhLk5leHRUb2tlbiAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdHMgPSBhd2FpdCB0aGlzLmdldFF1ZXJ5UmVzdWx0czxUPihxdWVyeUV4ZWN1dGlvbklkLCBkYXRhLk5leHRUb2tlbiwgcmVzdWx0cyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShyZXN1bHRzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQYXJzZXMgcmVzdWx0IHJvd3NcbiAgICAgKlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHRlbXBsYXRlIFRcbiAgICAgKiBAcGFyYW0ge0F0aGVuYS5Sb3dbXX0gcm93cyAtIHF1ZXJ5IHJlc3VsdCByb3dzXG4gICAgICogQHBhcmFtIHtBdGhlbmFDb2x1bW5bXX0gY29sdW1ucyAtIHF1ZXJ5IHJlc3VsdCBjb2x1bW5zXG4gICAgICogQHBhcmFtIHtib29sZWFufSBpc0ZpcnN0UGFnZVxuICAgICAqIEByZXR1cm5zIHtUW119IC0gcGFyc2VkIHJlc3VsdCBhY2NvcmRpbmcgdG8gbmVlZGVkIHBhcnNlclxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDbGllbnRcbiAgICAgKi9cbiAgICBwcml2YXRlIHBhcnNlUm93czxUPihyb3dzOiBBdGhlbmEuUm93W10sIGNvbHVtbnM6IEF0aGVuYUNvbHVtbltdLCBpc0ZpcnN0UGFnZSA9IGZhbHNlKTogVFtdIHtcbiAgICAgICAgY29uc3QgcmVzdWx0czogVFtdID0gW107XG5cbiAgICAgICAgLy8gU3RhcnQgd2l0aCAxIHdoZW4gZmlyc3QgbGluZSBpcyBjb2x1bW4gdGl0bGUgKGluIGZpcnN0IHBhZ2UpXG4gICAgICAgIGZvciAobGV0IHJvd0luZGV4ID0gKGlzRmlyc3RQYWdlKSA/IDEgOiAwOyByb3dJbmRleCA8IHJvd3MubGVuZ3RoOyByb3dJbmRleCsrKSB7XG4gICAgICAgICAgICBjb25zdCByb3cgPSByb3dzW3Jvd0luZGV4XTtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogVCA9IDxUPnt9O1xuXG4gICAgICAgICAgICBmb3IgKGxldCByb3dEYXRhSW5kZXggPSAwOyByb3dEYXRhSW5kZXggPCByb3cuRGF0YS5sZW5ndGg7IHJvd0RhdGFJbmRleCsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgcm93RGF0YSA9IHJvdy5EYXRhW3Jvd0RhdGFJbmRleF07XG4gICAgICAgICAgICAgICAgY29uc3QgY29sdW1uID0gY29sdW1uc1tyb3dEYXRhSW5kZXhdO1xuXG4gICAgICAgICAgICAgICAgaWYgKHJvd0RhdGEgIT0gbnVsbCAmJiByb3dEYXRhLlZhckNoYXJWYWx1ZSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdFtjb2x1bW4ubmFtZV0gPSBjb2x1bW4ucGFyc2Uocm93RGF0YS5WYXJDaGFyVmFsdWUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdFtjb2x1bW4ubmFtZV0gPSBudWxsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVzdWx0cy5wdXNoKHJlc3VsdCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXQgYXBwcm9wcmlhdGUgY29sdW1uIHBhcnNlcnMgYWNjb3JkaW5nIHRvIGNvbHVtbnMnIGRhdGEgdHlwZVxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAcGFyYW0geyp9IGRhdGEgLSBxdWVyeSByZXN1bHRzXG4gICAgICogQHJldHVybnMge0F0aGVuYUNvbHVtbltdfSAtIGNvbHVtbiBuYW1lIGFuZCBwYXJzZXIgdHlwZVxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDbGllbnRcbiAgICAgKi9cbiAgICBwcml2YXRlIHNldENvbHVtblBhcnNlcnMoZGF0YSk6IEF0aGVuYUNvbHVtbltdIHtcbiAgICAgICAgY29uc3QgY29sdW1uczogQXRoZW5hQ29sdW1uW10gPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IGNvbHVtbkluZm8gb2YgZGF0YS5SZXN1bHRTZXQuUmVzdWx0U2V0TWV0YWRhdGEuQ29sdW1uSW5mbykge1xuICAgICAgICAgICAgY29uc3QgY29sdW1uID0gbmV3IEF0aGVuYUNvbHVtbigpO1xuICAgICAgICAgICAgY29sdW1uLm5hbWUgPSBjb2x1bW5JbmZvLk5hbWU7XG5cbiAgICAgICAgICAgIHN3aXRjaCAoY29sdW1uSW5mby5UeXBlIGFzIEF0aGVuYURhdGFUeXBlRW51bSkge1xuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkludGVnZXI6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uVGlueUludDpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5TbWFsbEludDpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5CaWdJbnQ6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uRmxvYXQ6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uRG91YmxlOlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkRlY2ltYWw6XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbi5wYXJzZSA9IEF0aGVuYUNvbHVtbi5wYXJzZU51bWJlcjtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5DaGFyOlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLlZhcmNoYXI6XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbi5wYXJzZSA9IEF0aGVuYUNvbHVtbi5wYXJzZVN0cmluZztcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5Cb29sZWFuOlxuICAgICAgICAgICAgICAgICAgICBjb2x1bW4ucGFyc2UgPSBBdGhlbmFDb2x1bW4ucGFyc2VCb29sZWFuO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkRhdGU6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uVGltZXN0YW1wOlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLlRpbWVzdGFtcFdpdGhUejpcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uLnBhcnNlID0gQXRoZW5hQ29sdW1uLnBhcnNlRGF0ZTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5BcnJheTpcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uLnBhcnNlID0gQXRoZW5hQ29sdW1uLnBhcnNlQXJyYXk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkpzb246XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbi5wYXJzZSA9IEF0aGVuYUNvbHVtbi5wYXJzZUpzb247XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkJpbmFyeTpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5NYXA6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uU3RydWN0OlxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ29sdW1uIHR5cGUgJyR7Y29sdW1uSW5mby5UeXBlfScgbm90IHN1cHBvcnRlZGApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb2x1bW5zLnB1c2goY29sdW1uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBjb2x1bW5zO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENoZWNrcyB0aGUgcXVlcnkgZXhlY3V0aW9uIHN0YXR1cyB1bnRpbCB0aGUgcXVlcnkgc2VuZHMgU1VDQ0VFREVEIHNpZ25hbFxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAcGFyYW0ge1F1ZXJ5fSBxdWVyeSAtIHRoZSBxdWVyeVxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fSAtIHByb21pc2UgdGhhdCB3aWxsIHJlc29sdmUgb25jZSB0aGUgb3BlcmF0aW9uIGhhcyBmaW5pc2hlZFxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDbGllbnRcbiAgICAgKi9cbiAgICBwcml2YXRlIGFzeW5jIHdhaXRVbnRpbFN1Y2NlZWRRdWVyeShxdWVyeTogUXVlcnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgcmVxdWVzdFBhcmFtczogQXRoZW5hLlR5cGVzLkdldFF1ZXJ5RXhlY3V0aW9uSW5wdXQgPSB7XG4gICAgICAgICAgICBRdWVyeUV4ZWN1dGlvbklkOiBxdWVyeS5hdGhlbmFJZCxcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5jbGllbnQuZ2V0UXVlcnlFeGVjdXRpb24ocmVxdWVzdFBhcmFtcywgYXN5bmMgKGVyciwgZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcXVlcnkuc3RhdHVzID0gZGF0YS5RdWVyeUV4ZWN1dGlvbi5TdGF0dXMuU3RhdGU7XG5cbiAgICAgICAgICAgICAgICBzd2l0Y2ggKHF1ZXJ5LnN0YXR1cykge1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdTVUNDRUVERUQnOlxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnUVVFVUVEJzpcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnUlVOTklORyc6XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLndhaXRVbnRpbFN1Y2NlZWRRdWVyeShxdWVyeSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9LCB0aGlzLmNvbmZpZy53YWl0VGltZSAqIDEwMDApO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgICAgICAgICBjYXNlICdDQU5DRUxMRUQnOlxuICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBRdWVyeUNhbmNlbGVkRXhjZXB0aW9uKCkpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnRkFJTEVEJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgQXRoZW5hQ2xpZW50RXhjZXB0aW9uKCdRdWVyeSBmYWlsZWQnKSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBBdGhlbmFDbGllbnRFeGNlcHRpb24oYFF1ZXJ5IFN0YXR1cyAnJHtkYXRhLlF1ZXJ5RXhlY3V0aW9uLlN0YXR1cy5TdGF0ZX0nIG5vdCBzdXBwb3J0ZWRgKSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG59XG5cbi8qKlxuICogQXRoZW5hQ29sdW1uIGNsYXNzXG4gKlxuICogQGNsYXNzIEF0aGVuYUNvbHVtblxuICovXG5jbGFzcyBBdGhlbmFDb2x1bW4ge1xuICAgIHB1YmxpYyBuYW1lOiBzdHJpbmc7XG5cbiAgICBwdWJsaWMgcGFyc2U6ICh2YWx1ZTogc3RyaW5nKSA9PiBhbnk7XG5cbiAgICAvKipcbiAgICAgKiBQYXJzZXMgc3RyaW5nIHRvIG51bWJlclxuICAgICAqXG4gICAgICogQHN0YXRpY1xuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB2YWx1ZSAtIHN0cmluZyB0byBwYXJzZVxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9IC0gcGFyc2VkIG51bWJlclxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDb2x1bW5cbiAgICAgKi9cbiAgICBwdWJsaWMgc3RhdGljIHBhcnNlTnVtYmVyKHZhbHVlOiBzdHJpbmcpOiBudW1iZXIge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBOdW1iZXIodmFsdWUpO1xuXG4gICAgICAgIGlmIChpc05hTihyZXN1bHQpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRoZSB2YWx1ZSAnJHt2YWx1ZX0gJ2lzIG5vdCBhIG51bWJlcmApO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQYXJzZXMgc3RyaW5nXG4gICAgICpcbiAgICAgKiBAc3RhdGljXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHZhbHVlIC0gc3RyaW5nIHRvIHBhcnNlXG4gICAgICogQHJldHVybnMge3N0cmluZ30gLSBwYXJzZWQgc3RyaW5nXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNvbHVtblxuICAgICAqL1xuICAgIHB1YmxpYyBzdGF0aWMgcGFyc2VTdHJpbmcodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQYXJzZXMgYm9vbGVhbi1saWtlIEF0aGVuYSBleHByZXNzaW9uIHRvIGJvb2xlYW5cbiAgICAgKlxuICAgICAqIEBzdGF0aWNcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdmFsdWUgLSBib29sZWFuLWxpa2Ugc3RyaW5nXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IC0gcGFyc2VkIHN0cmluZ1xuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDb2x1bW5cbiAgICAgKi9cbiAgICBwdWJsaWMgc3RhdGljIHBhcnNlQm9vbGVhbih2YWx1ZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICB2YWx1ZSA9PT0gJ3RydWUnXG4gICAgICAgICAgICB8fCB2YWx1ZSA9PT0gJ1RSVUUnXG4gICAgICAgICAgICB8fCB2YWx1ZSA9PT0gJ3QnXG4gICAgICAgICAgICB8fCB2YWx1ZSA9PT0gJ1QnXG4gICAgICAgICAgICB8fCB2YWx1ZSA9PT0gJ3llcydcbiAgICAgICAgICAgIHx8IHZhbHVlID09PSAnWUVTJ1xuICAgICAgICAgICAgfHwgdmFsdWUgPT09ICcxJ1xuICAgICAgICApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBhcnNlcyBzdHJpbmcgdG8gZGF0ZVxuICAgICAqXG4gICAgICogQHN0YXRpY1xuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB2YWx1ZSAtIHN0cmluZyB0byBwYXJzZVxuICAgICAqIEByZXR1cm5zIHtEYXRlfSAtIHBhcnNlZCBkYXRlXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNvbHVtblxuICAgICAqL1xuICAgIHB1YmxpYyBzdGF0aWMgcGFyc2VEYXRlKHZhbHVlOiBzdHJpbmcpOiBEYXRlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBEYXRlKHZhbHVlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQYXJzZXMgc3RyaW5nIHRvIGFycmF5XG4gICAgICpcbiAgICAgKiBAc3RhdGljXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGFycmF5SW5TdHJpbmcgLSBzdHJpbmcgdG8gcGFyc2VcbiAgICAgKiBAcmV0dXJucyB7YW55W119IC0gcGFyc2VkIGFycmF5XG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNvbHVtblxuICAgICAqL1xuICAgIHB1YmxpYyBzdGF0aWMgcGFyc2VBcnJheShhcnJheUluU3RyaW5nOiBzdHJpbmcpOiBudW1iZXJbXSB8IHN0cmluZ1tdIHtcbiAgICAgICAgYXJyYXlJblN0cmluZyA9IGFycmF5SW5TdHJpbmcucmVwbGFjZSgvXFxbfFxcXS9naSwgJycpO1xuICAgICAgICBjb25zdCB2YWx1ZXMgPSBhcnJheUluU3RyaW5nLnNwbGl0KCcsICcpO1xuICAgICAgICBjb25zdCByZXN1bHQgPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IHZhbHVlIG9mIHZhbHVlcykge1xuICAgICAgICAgICAgbGV0IG51bWJlclZhbHVlID0gTnVtYmVyKHZhbHVlKTtcblxuICAgICAgICAgICAgaWYgKCFOdW1iZXIuaXNOYU4obnVtYmVyVmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2gobnVtYmVyVmFsdWUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXN1bHQucHVzaCh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBhcnNlcyBzdHJpbmcgdG8gYXJyYXlcbiAgICAgKlxuICAgICAqIEBzdGF0aWNcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdmFsdWUgLSBzdHJpbmcgdG8gcGFyc2VcbiAgICAgKiBAcmV0dXJucyB7YW55W119IC0gcGFyc2VkIGFycmF5XG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNvbHVtblxuICAgICAqL1xuICAgIHB1YmxpYyBzdGF0aWMgcGFyc2VKc29uKHZhbHVlOiBzdHJpbmcpOiBhbnlbXSB7XG4gICAgICAgIHJldHVybiBKU09OLnBhcnNlKHZhbHVlKTtcbiAgICB9XG59XG4iXX0=
