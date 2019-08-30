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

//# sourceMappingURL=data:application/json;charset=utf8;base64,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QUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUVoQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsRUFBRTtnQkFDNUIsTUFBTSxDQUFDLElBQUksQ0FBTSxXQUFXLENBQUMsQ0FBQzthQUNqQztpQkFBTTtnQkFDSCxNQUFNLENBQUMsSUFBSSxDQUFNLEtBQUssQ0FBQyxDQUFDO2FBQzNCO1NBQ0o7UUFFRCxPQUFPLE1BQU0sQ0FBQztJQUNsQixDQUFDO0lBRUQ7Ozs7Ozs7T0FPRztJQUNJLE1BQU0sQ0FBQyxTQUFTLENBQUMsS0FBYTtRQUNqQyxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDN0IsQ0FBQztDQUNKIiwiZmlsZSI6ImluZGV4LmpzIiwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnO1xuXG5pbXBvcnQge0F0aGVuYX0gZnJvbSAnYXdzLXNkayc7XG5pbXBvcnQge0F0aGVuYUNsaWVudENvbmZpZ30gZnJvbSAnLi9BdGhlbmFDbGllbnRDb25maWcnO1xuaW1wb3J0IHtRdWV1ZX0gZnJvbSAnLi9RdWV1ZSc7XG5pbXBvcnQge1F1ZXJ5fSBmcm9tICcuL1F1ZXJ5JztcbmltcG9ydCB7QXRoZW5hQ2xpZW50RXhjZXB0aW9ufSBmcm9tICcuL2V4Y2VwdGlvbi9BdGhlbmFDbGllbnRFeGNlcHRpb24nO1xuaW1wb3J0IHtRdWVyeUNhbmNlbGVkRXhjZXB0aW9ufSBmcm9tICcuL2V4Y2VwdGlvbi9RdWVyeUNhbmNlbGVkRXhjZXB0aW9uJztcblxuZW51bSBBdGhlbmFEYXRhVHlwZUVudW0ge1xuICAgIEludGVnZXIgPSAnaW50ZWdlcicsXG4gICAgRmxvYXQgPSAnZmxvYXQnLFxuICAgIERvdWJsZSA9ICdkb3VibGUnLFxuICAgIERlY2ltYWwgPSAnZGVjaW1hbCcsXG4gICAgQ2hhciA9ICdjaGFyJyxcbiAgICBWYXJjaGFyID0gJ3ZhcmNoYXInLFxuICAgIEJvb2xlYW4gPSAnYm9vbGVhbicsXG4gICAgQmluYXJ5ID0gJ2JpbmFyeScsXG4gICAgRGF0ZSA9ICdkYXRlJyxcbiAgICBUaW1lc3RhbXAgPSAndGltZXN0YW1wJyxcbiAgICBUaW1lc3RhbXBXaXRoVHogPSAndGltZXN0YW1wIHdpdGggdGltZSB6b25lJyxcbiAgICBBcnJheSA9ICdhcnJheScsXG4gICAgSnNvbiA9ICdqc29uJyxcbiAgICBNYXAgPSAnbWFwJyxcbiAgICBTdHJ1Y3QgPSAnc3RydWN0JyxcbiAgICBUaW55SW50ID0gJ3RpbnlpbnQnLFxuICAgIFNtYWxsSW50ID0gJ3NtYWxsaW50JyxcbiAgICBCaWdJbnQgPSAnYmlnaW50Jyxcbn1cblxuLyoqXG4gKiBBdGhlbmFDbGllbnQgY2xhc3NcbiAqXG4gKiBAZXhwb3J0XG4gKiBAY2xhc3MgQXRoZW5hQ2xpZW50XG4gKi9cbmV4cG9ydCBjbGFzcyBBdGhlbmFDbGllbnQge1xuICAgIHByaXZhdGUgcmVhZG9ubHkgY2xpZW50OiBBdGhlbmE7XG5cbiAgICBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZzogQXRoZW5hQ2xpZW50Q29uZmlnO1xuXG4gICAgcHJpdmF0ZSBxdWV1ZTogUXVldWU7XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGFuIGluc3RhbmNlIG9mIEF0aGVuYUNsaWVudC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7QXRoZW5hQ2xpZW50Q29uZmlnfSBjb25maWcgLSBDb25maWcgZm9yIEFXUyBBdGhlbmFcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGNvbmZpZzogQXRoZW5hQ2xpZW50Q29uZmlnKSB7XG4gICAgICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICAgICAgICB0aGlzLmNvbmZpZy5hd3NDb25maWcuYXBpVmVyc2lvbiA9ICcyMDE3LTA1LTE4JztcblxuICAgICAgICB0aGlzLmNsaWVudCA9IG5ldyBBdGhlbmEodGhpcy5jb25maWcuYXdzQ29uZmlnKTtcbiAgICAgICAgdGhpcy5xdWV1ZSA9IG5ldyBRdWV1ZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgcXVlcnkgaW4gQXRoZW5hXG4gICAgICpcbiAgICAgKiBAdGVtcGxhdGUgVFxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHNxbCAtIHF1ZXJ5IHRvIGV4ZWN1dGUsIGFzIHN0cmluZ1xuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBwYXJhbWV0ZXJzIC0gcGFyYW1ldGVycyBmb3IgcXVlcnlcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gaWQgLSBZb3VyIGN1c3RvbSBJRFxuICAgICAqXG4gICAgICogQHJldHVybnMge1Byb21pc2U8VFtdPn0gLSBwYXJzZWQgcXVlcnkgcmVzdWx0c1xuICAgICAqXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNsaWVudFxuICAgICAqL1xuICAgIHB1YmxpYyBhc3luYyBleGVjdXRlUXVlcnk8VD4oc3FsOiBzdHJpbmcsIHBhcmFtZXRlcnM/OiBPYmplY3QsIGlkPzogc3RyaW5nKTogUHJvbWlzZTxUW10+IHtcbiAgICAgICAgY29uc3QgcXVlcnkgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeUNvbW1vbihzcWwsIHBhcmFtZXRlcnMsIGlkKTtcblxuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5nZXRRdWVyeVJlc3VsdHMocXVlcnkuYXRoZW5hSWQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgcXVlcnkgaW4gQXRoZW5hIGFuZCBnZXQgUzMgVVJMIHdpdGggQ1NWIGZpbGVcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBzcWwgLSBxdWVyeSB0byBleGVjdXRlLCBhcyBzdHJpbmdcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gcGFyYW1ldGVycyAtIHBhcmFtZXRlcnMgZm9yIHF1ZXJ5XG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGlkIC0gWW91ciBjdXN0b20gSURcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPHN0cmluZz59IC0gUzMgVVJMXG4gICAgICpcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHVibGljIGFzeW5jIGV4ZWN1dGVRdWVyeUFuZEdldFMzVXJsKHNxbDogc3RyaW5nLCBwYXJhbWV0ZXJzPzogT2JqZWN0LCBpZD86IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnlDb21tb24oc3FsLCBwYXJhbWV0ZXJzLCBpZCk7XG4gICAgICAgIGNvbnN0IHMzQnVja2V0VXJpID0gYXdhaXQgdGhpcy5nZXRPdXRwdXRTM0J1Y2tldCgpO1xuXG4gICAgICAgIHJldHVybiBgJHtzM0J1Y2tldFVyaX0ke3F1ZXJ5LmF0aGVuYUlkfS5jc3ZgO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENhbmNlbCBhIEFXUyBBdGhlbmEgcXVlcnlcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBpZCBZb3VyIGN1c3RvbSBJRFxuICAgICAqXG4gICAgICogQHJldHVybnMge1Byb21pc2U8dm9pZD59XG4gICAgICpcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHVibGljIGFzeW5jIGNhbmNlbFF1ZXJ5KGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgcXVlcnkgPSB0aGlzLnF1ZXVlLmdldFF1ZXJ5QnlJZChpZCk7XG4gICAgICAgIGNvbnN0IHJlcXVlc3RQYXJhbXM6IEF0aGVuYS5UeXBlcy5TdG9wUXVlcnlFeGVjdXRpb25JbnB1dCA9IHtcbiAgICAgICAgICAgIFF1ZXJ5RXhlY3V0aW9uSWQ6IHF1ZXJ5LmF0aGVuYUlkLFxuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICB0aGlzLmNsaWVudC5zdG9wUXVlcnlFeGVjdXRpb24ocmVxdWVzdFBhcmFtcywgKGVyciwgZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCBXb3JrR3JvdXAgZGV0YWlsc1xuICAgICAqXG4gICAgICogQHJldHVybnMge1Byb21pc2U8QXRoZW5hLldvcmtHcm91cD59IEFXUyBXb3JrR3JvdXAgT2JqZWN0XG4gICAgICovXG4gICAgcHVibGljIGFzeW5jIGdldFdvcmtHcm91cERldGFpbHMoKTogUHJvbWlzZTxBdGhlbmEuV29ya0dyb3VwPiB7XG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy53b3JrR3JvdXAgPT0gbnVsbCB8fCB0aGlzLmNvbmZpZy53b3JrR3JvdXAgPT09ICcnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1lvdSBtdXN0IGRlZmluZSBhbiBBV1MgQXRoZW5hIFdvcmtHcm91cCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcGFyYW1ldGVyczogQXRoZW5hLkdldFdvcmtHcm91cElucHV0ID0ge1xuICAgICAgICAgICAgV29ya0dyb3VwOiB0aGlzLmNvbmZpZy53b3JrR3JvdXAsXG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPEF0aGVuYS5Xb3JrR3JvdXA+KChyZXNvbHZlOiBGdW5jdGlvbiwgcmVqZWN0OiBGdW5jdGlvbikgPT4ge1xuICAgICAgICAgICAgdGhpcy5jbGllbnQuZ2V0V29ya0dyb3VwKHBhcmFtZXRlcnMsICgoZXJyOiBFcnJvciwgZGF0YTogQXRoZW5hLkdldFdvcmtHcm91cE91dHB1dCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUoZGF0YS5Xb3JrR3JvdXApO1xuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgb3V0cHV0IFMzIGJ1Y2tldCBmcm9tIGJ1Y2tldFVyaSBjb25maWcgcGFyYW1ldGVyIG9yIGZyb20gV29ya0dyb3VwXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxzdHJpbmc+fSBTMyBCdWNrZXQgVVJJXG4gICAgICovXG4gICAgcHVibGljIGFzeW5jIGdldE91dHB1dFMzQnVja2V0KCk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgICAgIGxldCBidWNrZXQ6IHN0cmluZztcblxuICAgICAgICBpZiAodGhpcy5jb25maWcuYnVja2V0VXJpICE9IG51bGwgJiYgdGhpcy5jb25maWcuYnVja2V0VXJpICE9PSAnJykge1xuICAgICAgICAgICAgYnVja2V0ID0gdGhpcy5jb25maWcuYnVja2V0VXJpO1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuY29uZmlnLndvcmtHcm91cCAhPSBudWxsIHx8IHRoaXMuY29uZmlnLndvcmtHcm91cCAhPT0gJycpIHtcbiAgICAgICAgICAgIGNvbnN0IHdvcmtHcm91cCA9IGF3YWl0IHRoaXMuZ2V0V29ya0dyb3VwRGV0YWlscygpO1xuXG4gICAgICAgICAgICBidWNrZXQgPSB3b3JrR3JvdXAuQ29uZmlndXJhdGlvbi5SZXN1bHRDb25maWd1cmF0aW9uLk91dHB1dExvY2F0aW9uO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdZb3UgbXVzdCBkZWZpbmUgYSBTMyBCdWNrZXQgVVJJIGFuZC9vciBhIFdvcmtHcm91cCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGJ1Y2tldDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVRdWVyeUNvbW1vbihzcWw6IHN0cmluZywgcGFyYW1ldGVycz86IE9iamVjdCwgaWQ/OiBzdHJpbmcpOiBQcm9taXNlPFF1ZXJ5PiB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gbmV3IFF1ZXJ5KHNxbCwgcGFyYW1ldGVycywgaWQpO1xuXG4gICAgICAgIHRoaXMucXVldWUuYWRkUXVlcnkocXVlcnkpO1xuXG4gICAgICAgIHF1ZXJ5LmF0aGVuYUlkID0gYXdhaXQgdGhpcy5zdGFydFF1ZXJ5RXhlY3V0aW9uKHF1ZXJ5KTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy53YWl0VW50aWxTdWNjZWVkUXVlcnkocXVlcnkpO1xuICAgICAgICB9IGNhdGNoIChleGNlcHRpb24pIHtcbiAgICAgICAgICAgIHRoaXMucXVldWUucmVtb3ZlUXVlcnkocXVlcnkpO1xuXG4gICAgICAgICAgICB0aHJvdyBleGNlcHRpb247XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3RhcnRzIHF1ZXJ5IGV4ZWN1dGlvbiBhbmQgZ2V0cyBhbiBJRCBmb3IgdGhlIG9wZXJhdGlvblxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAcGFyYW0ge1F1ZXJ5fSBxdWVyeSAtIEF0aGVuYSByZXF1ZXN0IHBhcmFtc1xuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPHN0cmluZz59IC0gcXVlcnkgZXhlY3V0aW9uIGlkXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNsaWVudFxuICAgICAqL1xuICAgIHByaXZhdGUgYXN5bmMgc3RhcnRRdWVyeUV4ZWN1dGlvbihxdWVyeTogUXVlcnkpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgICAgICBjb25zdCByZXF1ZXN0UGFyYW1zOiBBdGhlbmEuVHlwZXMuU3RhcnRRdWVyeUV4ZWN1dGlvbklucHV0ID0ge1xuICAgICAgICAgICAgUXVlcnlFeGVjdXRpb25Db250ZXh0OiB7XG4gICAgICAgICAgICAgICAgRGF0YWJhc2U6IHRoaXMuY29uZmlnLmRhdGFiYXNlLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFF1ZXJ5U3RyaW5nOiBxdWVyeS5zcWwsXG4gICAgICAgICAgICBSZXN1bHRDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgICAgICAgT3V0cHV0TG9jYXRpb246IHRoaXMuY29uZmlnLmJ1Y2tldFVyaSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKHRoaXMuY29uZmlnLndvcmtHcm91cCAhPSBudWxsKSB7XG4gICAgICAgICAgICByZXF1ZXN0UGFyYW1zLldvcmtHcm91cCA9IHRoaXMuY29uZmlnLndvcmtHcm91cDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTxzdHJpbmc+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRoaXMuY2xpZW50LnN0YXJ0UXVlcnlFeGVjdXRpb24ocmVxdWVzdFBhcmFtcywgKGVyciwgZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUoZGF0YS5RdWVyeUV4ZWN1dGlvbklkKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQcm9jZXNzZXMgcXVlcnkgcmVzdWx0cyBhbmQgcGFyc2VzIHRoZW1cbiAgICAgKlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHRlbXBsYXRlIFRcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBxdWVyeUV4ZWN1dGlvbklkIC0gcXVlcnkgZXhlY3V0aW9uIGlkZW50aWZpZXJcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmV4dFRva2VuXG4gICAgICogQHBhcmFtIHtUW119IHByZXZpb3VzUmVzdWx0c1xuICAgICAqXG4gICAgICogQHJldHVybnMge1Byb21pc2U8VFtdPn0gLSBwYXJzZWQgcXVlcnkgcmVzdWx0IHJvd3NcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHJpdmF0ZSBnZXRRdWVyeVJlc3VsdHM8VD4ocXVlcnlFeGVjdXRpb25JZDogc3RyaW5nLCBuZXh0VG9rZW4/OiBzdHJpbmcsIHByZXZpb3VzUmVzdWx0cz86IFRbXSk6IFByb21pc2U8VFtdPiB7XG4gICAgICAgIGNvbnN0IHJlcXVlc3RQYXJhbXM6IEF0aGVuYS5UeXBlcy5HZXRRdWVyeVJlc3VsdHNJbnB1dCA9IHtcbiAgICAgICAgICAgIE5leHRUb2tlbjogbmV4dFRva2VuLFxuICAgICAgICAgICAgUXVlcnlFeGVjdXRpb25JZDogcXVlcnlFeGVjdXRpb25JZCxcbiAgICAgICAgfTtcblxuICAgICAgICBsZXQgY29sdW1uczogQXRoZW5hQ29sdW1uW107XG5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPGFueT4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5jbGllbnQuZ2V0UXVlcnlSZXN1bHRzKHJlcXVlc3RQYXJhbXMsIGFzeW5jIChlcnIsIGRhdGEpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbHVtbnMgPSB0aGlzLnNldENvbHVtblBhcnNlcnMoZGF0YSk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBpc0ZpcnN0UGFnZSA9IChwcmV2aW91c1Jlc3VsdHMgPT0gbnVsbCAmJiBuZXh0VG9rZW4gPT0gbnVsbCk7XG5cbiAgICAgICAgICAgICAgICBsZXQgcmVzdWx0cyA9IHRoaXMucGFyc2VSb3dzPFQ+KGRhdGEuUmVzdWx0U2V0LlJvd3MsIGNvbHVtbnMsIGlzRmlyc3RQYWdlKTtcblxuICAgICAgICAgICAgICAgIGlmIChwcmV2aW91c1Jlc3VsdHMgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHRzID0gcHJldmlvdXNSZXN1bHRzLmNvbmNhdChyZXN1bHRzKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoZGF0YS5OZXh0VG9rZW4gIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHRzID0gYXdhaXQgdGhpcy5nZXRRdWVyeVJlc3VsdHM8VD4ocXVlcnlFeGVjdXRpb25JZCwgZGF0YS5OZXh0VG9rZW4sIHJlc3VsdHMpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJlc29sdmUocmVzdWx0cyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGFyc2VzIHJlc3VsdCByb3dzXG4gICAgICpcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqIEB0ZW1wbGF0ZSBUXG4gICAgICogQHBhcmFtIHtBdGhlbmEuUm93W119IHJvd3MgLSBxdWVyeSByZXN1bHQgcm93c1xuICAgICAqIEBwYXJhbSB7QXRoZW5hQ29sdW1uW119IGNvbHVtbnMgLSBxdWVyeSByZXN1bHQgY29sdW1uc1xuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gaXNGaXJzdFBhZ2VcbiAgICAgKiBAcmV0dXJucyB7VFtdfSAtIHBhcnNlZCByZXN1bHQgYWNjb3JkaW5nIHRvIG5lZWRlZCBwYXJzZXJcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHJpdmF0ZSBwYXJzZVJvd3M8VD4ocm93czogQXRoZW5hLlJvd1tdLCBjb2x1bW5zOiBBdGhlbmFDb2x1bW5bXSwgaXNGaXJzdFBhZ2UgPSBmYWxzZSk6IFRbXSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdHM6IFRbXSA9IFtdO1xuXG4gICAgICAgIC8vIFN0YXJ0IHdpdGggMSB3aGVuIGZpcnN0IGxpbmUgaXMgY29sdW1uIHRpdGxlIChpbiBmaXJzdCBwYWdlKVxuICAgICAgICBmb3IgKGxldCByb3dJbmRleCA9IChpc0ZpcnN0UGFnZSkgPyAxIDogMDsgcm93SW5kZXggPCByb3dzLmxlbmd0aDsgcm93SW5kZXgrKykge1xuICAgICAgICAgICAgY29uc3Qgcm93ID0gcm93c1tyb3dJbmRleF07XG4gICAgICAgICAgICBjb25zdCByZXN1bHQ6IFQgPSA8VD57fTtcblxuICAgICAgICAgICAgZm9yIChsZXQgcm93RGF0YUluZGV4ID0gMDsgcm93RGF0YUluZGV4IDwgcm93LkRhdGEubGVuZ3RoOyByb3dEYXRhSW5kZXgrKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJvd0RhdGEgPSByb3cuRGF0YVtyb3dEYXRhSW5kZXhdO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbHVtbiA9IGNvbHVtbnNbcm93RGF0YUluZGV4XTtcblxuICAgICAgICAgICAgICAgIGlmIChyb3dEYXRhICE9IG51bGwgJiYgcm93RGF0YS5WYXJDaGFyVmFsdWUgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHRbY29sdW1uLm5hbWVdID0gY29sdW1uLnBhcnNlKHJvd0RhdGEuVmFyQ2hhclZhbHVlKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHRbY29sdW1uLm5hbWVdID0gbnVsbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJlc3VsdHMucHVzaChyZXN1bHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0IGFwcHJvcHJpYXRlIGNvbHVtbiBwYXJzZXJzIGFjY29yZGluZyB0byBjb2x1bW5zJyBkYXRhIHR5cGVcbiAgICAgKlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHBhcmFtIHsqfSBkYXRhIC0gcXVlcnkgcmVzdWx0c1xuICAgICAqIEByZXR1cm5zIHtBdGhlbmFDb2x1bW5bXX0gLSBjb2x1bW4gbmFtZSBhbmQgcGFyc2VyIHR5cGVcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHJpdmF0ZSBzZXRDb2x1bW5QYXJzZXJzKGRhdGEpOiBBdGhlbmFDb2x1bW5bXSB7XG4gICAgICAgIGNvbnN0IGNvbHVtbnM6IEF0aGVuYUNvbHVtbltdID0gW107XG5cbiAgICAgICAgZm9yIChjb25zdCBjb2x1bW5JbmZvIG9mIGRhdGEuUmVzdWx0U2V0LlJlc3VsdFNldE1ldGFkYXRhLkNvbHVtbkluZm8pIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbHVtbiA9IG5ldyBBdGhlbmFDb2x1bW4oKTtcbiAgICAgICAgICAgIGNvbHVtbi5uYW1lID0gY29sdW1uSW5mby5OYW1lO1xuXG4gICAgICAgICAgICBzd2l0Y2ggKGNvbHVtbkluZm8uVHlwZSBhcyBBdGhlbmFEYXRhVHlwZUVudW0pIHtcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5JbnRlZ2VyOlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLlRpbnlJbnQ6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uU21hbGxJbnQ6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uQmlnSW50OlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkZsb2F0OlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkRvdWJsZTpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5EZWNpbWFsOlxuICAgICAgICAgICAgICAgICAgICBjb2x1bW4ucGFyc2UgPSBBdGhlbmFDb2x1bW4ucGFyc2VOdW1iZXI7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uQ2hhcjpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5WYXJjaGFyOlxuICAgICAgICAgICAgICAgICAgICBjb2x1bW4ucGFyc2UgPSBBdGhlbmFDb2x1bW4ucGFyc2VTdHJpbmc7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uQm9vbGVhbjpcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uLnBhcnNlID0gQXRoZW5hQ29sdW1uLnBhcnNlQm9vbGVhbjtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5EYXRlOlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLlRpbWVzdGFtcDpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5UaW1lc3RhbXBXaXRoVHo6XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbi5wYXJzZSA9IEF0aGVuYUNvbHVtbi5wYXJzZURhdGU7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uQXJyYXk6XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbi5wYXJzZSA9IEF0aGVuYUNvbHVtbi5wYXJzZUFycmF5O1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5Kc29uOlxuICAgICAgICAgICAgICAgICAgICBjb2x1bW4ucGFyc2UgPSBBdGhlbmFDb2x1bW4ucGFyc2VKc29uO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5CaW5hcnk6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uTWFwOlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLlN0cnVjdDpcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENvbHVtbiB0eXBlICcke2NvbHVtbkluZm8uVHlwZX0nIG5vdCBzdXBwb3J0ZWRgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29sdW1ucy5wdXNoKGNvbHVtbik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gY29sdW1ucztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDaGVja3MgdGhlIHF1ZXJ5IGV4ZWN1dGlvbiBzdGF0dXMgdW50aWwgdGhlIHF1ZXJ5IHNlbmRzIFNVQ0NFRURFRCBzaWduYWxcbiAgICAgKlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHBhcmFtIHtRdWVyeX0gcXVlcnkgLSB0aGUgcXVlcnlcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTx2b2lkPn0gLSBwcm9taXNlIHRoYXQgd2lsbCByZXNvbHZlIG9uY2UgdGhlIG9wZXJhdGlvbiBoYXMgZmluaXNoZWRcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHJpdmF0ZSBhc3luYyB3YWl0VW50aWxTdWNjZWVkUXVlcnkocXVlcnk6IFF1ZXJ5KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IHJlcXVlc3RQYXJhbXM6IEF0aGVuYS5UeXBlcy5HZXRRdWVyeUV4ZWN1dGlvbklucHV0ID0ge1xuICAgICAgICAgICAgUXVlcnlFeGVjdXRpb25JZDogcXVlcnkuYXRoZW5hSWQsXG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRoaXMuY2xpZW50LmdldFF1ZXJ5RXhlY3V0aW9uKHJlcXVlc3RQYXJhbXMsIGFzeW5jIChlcnIsIGRhdGEpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHF1ZXJ5LnN0YXR1cyA9IGRhdGEuUXVlcnlFeGVjdXRpb24uU3RhdHVzLlN0YXRlO1xuXG4gICAgICAgICAgICAgICAgc3dpdGNoIChxdWVyeS5zdGF0dXMpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnU1VDQ0VFREVEJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ1FVRVVFRCc6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ1JVTk5JTkcnOlxuICAgICAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy53YWl0VW50aWxTdWNjZWVkUXVlcnkocXVlcnkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWplY3QoZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSwgdGhpcy5jb25maWcud2FpdFRpbWUgKiAxMDAwKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnQ0FOQ0VMTEVEJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgUXVlcnlDYW5jZWxlZEV4Y2VwdGlvbigpKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ0ZBSUxFRCc6XG4gICAgICAgICAgICAgICAgICAgICAgICByZWplY3QobmV3IEF0aGVuYUNsaWVudEV4Y2VwdGlvbignUXVlcnkgZmFpbGVkJykpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgQXRoZW5hQ2xpZW50RXhjZXB0aW9uKGBRdWVyeSBTdGF0dXMgJyR7ZGF0YS5RdWVyeUV4ZWN1dGlvbi5TdGF0dXMuU3RhdGV9JyBub3Qgc3VwcG9ydGVkYCkpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxufVxuXG4vKipcbiAqIEF0aGVuYUNvbHVtbiBjbGFzc1xuICpcbiAqIEBjbGFzcyBBdGhlbmFDb2x1bW5cbiAqL1xuY2xhc3MgQXRoZW5hQ29sdW1uIHtcbiAgICBwdWJsaWMgbmFtZTogc3RyaW5nO1xuXG4gICAgcHVibGljIHBhcnNlOiAodmFsdWU6IHN0cmluZykgPT4gYW55O1xuXG4gICAgLyoqXG4gICAgICogUGFyc2VzIHN0cmluZyB0byBudW1iZXJcbiAgICAgKlxuICAgICAqIEBzdGF0aWNcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdmFsdWUgLSBzdHJpbmcgdG8gcGFyc2VcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfSAtIHBhcnNlZCBudW1iZXJcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ29sdW1uXG4gICAgICovXG4gICAgcHVibGljIHN0YXRpYyBwYXJzZU51bWJlcih2YWx1ZTogc3RyaW5nKTogbnVtYmVyIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gTnVtYmVyKHZhbHVlKTtcblxuICAgICAgICBpZiAoaXNOYU4ocmVzdWx0KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUaGUgdmFsdWUgJyR7dmFsdWV9ICdpcyBub3QgYSBudW1iZXJgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGFyc2VzIHN0cmluZ1xuICAgICAqXG4gICAgICogQHN0YXRpY1xuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB2YWx1ZSAtIHN0cmluZyB0byBwYXJzZVxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd9IC0gcGFyc2VkIHN0cmluZ1xuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDb2x1bW5cbiAgICAgKi9cbiAgICBwdWJsaWMgc3RhdGljIHBhcnNlU3RyaW5nKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGFyc2VzIGJvb2xlYW4tbGlrZSBBdGhlbmEgZXhwcmVzc2lvbiB0byBib29sZWFuXG4gICAgICpcbiAgICAgKiBAc3RhdGljXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHZhbHVlIC0gYm9vbGVhbi1saWtlIHN0cmluZ1xuICAgICAqIEByZXR1cm5zIHtib29sZWFufSAtIHBhcnNlZCBzdHJpbmdcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ29sdW1uXG4gICAgICovXG4gICAgcHVibGljIHN0YXRpYyBwYXJzZUJvb2xlYW4odmFsdWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgdmFsdWUgPT09ICd0cnVlJ1xuICAgICAgICAgICAgfHwgdmFsdWUgPT09ICdUUlVFJ1xuICAgICAgICAgICAgfHwgdmFsdWUgPT09ICd0J1xuICAgICAgICAgICAgfHwgdmFsdWUgPT09ICdUJ1xuICAgICAgICAgICAgfHwgdmFsdWUgPT09ICd5ZXMnXG4gICAgICAgICAgICB8fCB2YWx1ZSA9PT0gJ1lFUydcbiAgICAgICAgICAgIHx8IHZhbHVlID09PSAnMSdcbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQYXJzZXMgc3RyaW5nIHRvIGRhdGVcbiAgICAgKlxuICAgICAqIEBzdGF0aWNcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdmFsdWUgLSBzdHJpbmcgdG8gcGFyc2VcbiAgICAgKiBAcmV0dXJucyB7RGF0ZX0gLSBwYXJzZWQgZGF0ZVxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDb2x1bW5cbiAgICAgKi9cbiAgICBwdWJsaWMgc3RhdGljIHBhcnNlRGF0ZSh2YWx1ZTogc3RyaW5nKTogRGF0ZSB7XG4gICAgICAgIHJldHVybiBuZXcgRGF0ZSh2YWx1ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGFyc2VzIHN0cmluZyB0byBhcnJheVxuICAgICAqXG4gICAgICogQHN0YXRpY1xuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBhcnJheUluU3RyaW5nIC0gc3RyaW5nIHRvIHBhcnNlXG4gICAgICogQHJldHVybnMge2FueVtdfSAtIHBhcnNlZCBhcnJheVxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDb2x1bW5cbiAgICAgKi9cbiAgICBwdWJsaWMgc3RhdGljIHBhcnNlQXJyYXkoYXJyYXlJblN0cmluZzogc3RyaW5nKTogbnVtYmVyW10gfCBzdHJpbmdbXSB7XG4gICAgICAgIGFycmF5SW5TdHJpbmcgPSBhcnJheUluU3RyaW5nLnJlcGxhY2UoL1xcW3xcXF0vZ2ksICcnKTtcbiAgICAgICAgY29uc3QgdmFsdWVzID0gYXJyYXlJblN0cmluZy5zcGxpdCgnLCAnKTtcbiAgICAgICAgY29uc3QgcmVzdWx0OiBudW1iZXJbXSB8IHN0cmluZ1tdID0gW107XG5cbiAgICAgICAgZm9yIChjb25zdCB2YWx1ZSBvZiB2YWx1ZXMpIHtcbiAgICAgICAgICAgIGxldCBudW1iZXJWYWx1ZSA9IE51bWJlcih2YWx1ZSk7XG5cbiAgICAgICAgICAgIGlmICghTnVtYmVyLmlzTmFOKG51bWJlclZhbHVlKSkge1xuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKDxhbnk+bnVtYmVyVmFsdWUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXN1bHQucHVzaCg8YW55PnZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGFyc2VzIHN0cmluZyB0byBhcnJheVxuICAgICAqXG4gICAgICogQHN0YXRpY1xuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB2YWx1ZSAtIHN0cmluZyB0byBwYXJzZVxuICAgICAqIEByZXR1cm5zIHthbnlbXX0gLSBwYXJzZWQgYXJyYXlcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ29sdW1uXG4gICAgICovXG4gICAgcHVibGljIHN0YXRpYyBwYXJzZUpzb24odmFsdWU6IHN0cmluZyk6IGFueVtdIHtcbiAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UodmFsdWUpO1xuICAgIH1cbn1cbiJdfQ==
