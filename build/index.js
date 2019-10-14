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
        query.waitTime = this.config.waitTime;
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
                        console.log(query.waitTime);
                        const waitTime = query.waitTime * 1000;
                        await this.sleep(waitTime);
                        query.waitTime = query.waitTime * 2;
                        await this.waitUntilSucceedQuery(query);
                        // setTimeout(async () => {
                        //     try {
                        //         query.waitTime = Math.pow(query.waitTime, 2);
                        //         await this.waitUntilSucceedQuery(query);
                        //         resolve();
                        //     } catch (e) {
                        //         reject(e);
                        //     }
                        // }, waitTime);
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
    sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve();
            }, ms);
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
        if (arrayInString == null || arrayInString === '') {
            return [];
        }
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

//# sourceMappingURL=data:application/json;charset=utf8;base64,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QUNuQixDQUFDO0lBQ04sQ0FBQztJQUVEOzs7Ozs7O09BT0c7SUFDSSxNQUFNLENBQUMsU0FBUyxDQUFDLEtBQWE7UUFDakMsT0FBTyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUMzQixDQUFDO0lBRUQ7Ozs7Ozs7T0FPRztJQUNJLE1BQU0sQ0FBQyxVQUFVLENBQUMsYUFBcUI7UUFDMUMsYUFBYSxHQUFHLGFBQWEsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRXJELElBQUksYUFBYSxJQUFJLElBQUksSUFBSSxhQUFhLEtBQUssRUFBRSxFQUFFO1lBQy9DLE9BQU8sRUFBRSxDQUFDO1NBQ2I7UUFFRCxNQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sTUFBTSxHQUFHLEVBQUUsQ0FBQztRQUVsQixLQUFLLE1BQU0sS0FBSyxJQUFJLE1BQU0sRUFBRTtZQUN4QixJQUFJLFdBQVcsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7WUFFaEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLEVBQUU7Z0JBQzVCLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7YUFDNUI7aUJBQU07Z0JBQ0gsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQzthQUN0QjtTQUNKO1FBRUQsT0FBTyxNQUFNLENBQUM7SUFDbEIsQ0FBQztJQUVEOzs7Ozs7O09BT0c7SUFDSSxNQUFNLENBQUMsU0FBUyxDQUFDLEtBQWE7UUFDakMsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzdCLENBQUM7Q0FDSiIsImZpbGUiOiJpbmRleC5qcyIsInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcblxuaW1wb3J0IHtBdGhlbmF9IGZyb20gJ2F3cy1zZGsnO1xuaW1wb3J0IHtBdGhlbmFDbGllbnRDb25maWd9IGZyb20gJy4vQXRoZW5hQ2xpZW50Q29uZmlnJztcbmltcG9ydCB7UXVldWV9IGZyb20gJy4vUXVldWUnO1xuaW1wb3J0IHtRdWVyeX0gZnJvbSAnLi9RdWVyeSc7XG5pbXBvcnQge0F0aGVuYUNsaWVudEV4Y2VwdGlvbn0gZnJvbSAnLi9leGNlcHRpb24vQXRoZW5hQ2xpZW50RXhjZXB0aW9uJztcbmltcG9ydCB7UXVlcnlDYW5jZWxlZEV4Y2VwdGlvbn0gZnJvbSAnLi9leGNlcHRpb24vUXVlcnlDYW5jZWxlZEV4Y2VwdGlvbic7XG5cbmVudW0gQXRoZW5hRGF0YVR5cGVFbnVtIHtcbiAgICBJbnRlZ2VyID0gJ2ludGVnZXInLFxuICAgIEZsb2F0ID0gJ2Zsb2F0JyxcbiAgICBEb3VibGUgPSAnZG91YmxlJyxcbiAgICBEZWNpbWFsID0gJ2RlY2ltYWwnLFxuICAgIENoYXIgPSAnY2hhcicsXG4gICAgVmFyY2hhciA9ICd2YXJjaGFyJyxcbiAgICBCb29sZWFuID0gJ2Jvb2xlYW4nLFxuICAgIEJpbmFyeSA9ICdiaW5hcnknLFxuICAgIERhdGUgPSAnZGF0ZScsXG4gICAgVGltZXN0YW1wID0gJ3RpbWVzdGFtcCcsXG4gICAgVGltZXN0YW1wV2l0aFR6ID0gJ3RpbWVzdGFtcCB3aXRoIHRpbWUgem9uZScsXG4gICAgQXJyYXkgPSAnYXJyYXknLFxuICAgIEpzb24gPSAnanNvbicsXG4gICAgTWFwID0gJ21hcCcsXG4gICAgU3RydWN0ID0gJ3N0cnVjdCcsXG4gICAgVGlueUludCA9ICd0aW55aW50JyxcbiAgICBTbWFsbEludCA9ICdzbWFsbGludCcsXG4gICAgQmlnSW50ID0gJ2JpZ2ludCcsXG59XG5cbi8qKlxuICogQXRoZW5hQ2xpZW50IGNsYXNzXG4gKlxuICogQGV4cG9ydFxuICogQGNsYXNzIEF0aGVuYUNsaWVudFxuICovXG5leHBvcnQgY2xhc3MgQXRoZW5hQ2xpZW50IHtcbiAgICBwcml2YXRlIHJlYWRvbmx5IGNsaWVudDogQXRoZW5hO1xuXG4gICAgcHJpdmF0ZSByZWFkb25seSBjb25maWc6IEF0aGVuYUNsaWVudENvbmZpZztcblxuICAgIHByaXZhdGUgcXVldWU6IFF1ZXVlO1xuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhbiBpbnN0YW5jZSBvZiBBdGhlbmFDbGllbnQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0F0aGVuYUNsaWVudENvbmZpZ30gY29uZmlnIC0gQ29uZmlnIGZvciBBV1MgQXRoZW5hXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNsaWVudFxuICAgICAqL1xuICAgIHB1YmxpYyBjb25zdHJ1Y3Rvcihjb25maWc6IEF0aGVuYUNsaWVudENvbmZpZykge1xuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgICAgICAgdGhpcy5jb25maWcuYXdzQ29uZmlnLmFwaVZlcnNpb24gPSAnMjAxNy0wNS0xOCc7XG5cbiAgICAgICAgdGhpcy5jbGllbnQgPSBuZXcgQXRoZW5hKHRoaXMuY29uZmlnLmF3c0NvbmZpZyk7XG4gICAgICAgIHRoaXMucXVldWUgPSBuZXcgUXVldWUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFeGVjdXRlIHF1ZXJ5IGluIEF0aGVuYVxuICAgICAqXG4gICAgICogQHRlbXBsYXRlIFRcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBzcWwgLSBxdWVyeSB0byBleGVjdXRlLCBhcyBzdHJpbmdcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gcGFyYW1ldGVycyAtIHBhcmFtZXRlcnMgZm9yIHF1ZXJ5XG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGlkIC0gWW91ciBjdXN0b20gSURcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPFRbXT59IC0gcGFyc2VkIHF1ZXJ5IHJlc3VsdHNcbiAgICAgKlxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDbGllbnRcbiAgICAgKi9cbiAgICBwdWJsaWMgYXN5bmMgZXhlY3V0ZVF1ZXJ5PFQ+KHNxbDogc3RyaW5nLCBwYXJhbWV0ZXJzPzogT2JqZWN0LCBpZD86IHN0cmluZyk6IFByb21pc2U8VFtdPiB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnlDb21tb24oc3FsLCBwYXJhbWV0ZXJzLCBpZCk7XG5cbiAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZ2V0UXVlcnlSZXN1bHRzKHF1ZXJ5LmF0aGVuYUlkKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFeGVjdXRlIHF1ZXJ5IGluIEF0aGVuYSBhbmQgZ2V0IFMzIFVSTCB3aXRoIENTViBmaWxlXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gc3FsIC0gcXVlcnkgdG8gZXhlY3V0ZSwgYXMgc3RyaW5nXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHBhcmFtZXRlcnMgLSBwYXJhbWV0ZXJzIGZvciBxdWVyeVxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBpZCAtIFlvdXIgY3VzdG9tIElEXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxzdHJpbmc+fSAtIFMzIFVSTFxuICAgICAqXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNsaWVudFxuICAgICAqL1xuICAgIHB1YmxpYyBhc3luYyBleGVjdXRlUXVlcnlBbmRHZXRTM1VybChzcWw6IHN0cmluZywgcGFyYW1ldGVycz86IE9iamVjdCwgaWQ/OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgICAgICBjb25zdCBxdWVyeSA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5Q29tbW9uKHNxbCwgcGFyYW1ldGVycywgaWQpO1xuICAgICAgICBjb25zdCBzM0J1Y2tldFVyaSA9IGF3YWl0IHRoaXMuZ2V0T3V0cHV0UzNCdWNrZXQoKTtcblxuICAgICAgICByZXR1cm4gYCR7czNCdWNrZXRVcml9JHtxdWVyeS5hdGhlbmFJZH0uY3N2YDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDYW5jZWwgYSBBV1MgQXRoZW5hIHF1ZXJ5XG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gaWQgWW91ciBjdXN0b20gSURcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fVxuICAgICAqXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNsaWVudFxuICAgICAqL1xuICAgIHB1YmxpYyBhc3luYyBjYW5jZWxRdWVyeShpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5xdWV1ZS5nZXRRdWVyeUJ5SWQoaWQpO1xuICAgICAgICBjb25zdCByZXF1ZXN0UGFyYW1zOiBBdGhlbmEuVHlwZXMuU3RvcFF1ZXJ5RXhlY3V0aW9uSW5wdXQgPSB7XG4gICAgICAgICAgICBRdWVyeUV4ZWN1dGlvbklkOiBxdWVyeS5hdGhlbmFJZCxcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5jbGllbnQuc3RvcFF1ZXJ5RXhlY3V0aW9uKHJlcXVlc3RQYXJhbXMsIChlcnIsIGRhdGEpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgV29ya0dyb3VwIGRldGFpbHNcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPEF0aGVuYS5Xb3JrR3JvdXA+fSBBV1MgV29ya0dyb3VwIE9iamVjdFxuICAgICAqL1xuICAgIHB1YmxpYyBhc3luYyBnZXRXb3JrR3JvdXBEZXRhaWxzKCk6IFByb21pc2U8QXRoZW5hLldvcmtHcm91cD4ge1xuICAgICAgICBpZiAodGhpcy5jb25maWcud29ya0dyb3VwID09IG51bGwgfHwgdGhpcy5jb25maWcud29ya0dyb3VwID09PSAnJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdZb3UgbXVzdCBkZWZpbmUgYW4gQVdTIEF0aGVuYSBXb3JrR3JvdXAnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHBhcmFtZXRlcnM6IEF0aGVuYS5HZXRXb3JrR3JvdXBJbnB1dCA9IHtcbiAgICAgICAgICAgIFdvcmtHcm91cDogdGhpcy5jb25maWcud29ya0dyb3VwLFxuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTxBdGhlbmEuV29ya0dyb3VwPigocmVzb2x2ZTogRnVuY3Rpb24sIHJlamVjdDogRnVuY3Rpb24pID0+IHtcbiAgICAgICAgICAgIHRoaXMuY2xpZW50LmdldFdvcmtHcm91cChwYXJhbWV0ZXJzLCAoKGVycjogRXJyb3IsIGRhdGE6IEF0aGVuYS5HZXRXb3JrR3JvdXBPdXRwdXQpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKGRhdGEuV29ya0dyb3VwKTtcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IG91dHB1dCBTMyBidWNrZXQgZnJvbSBidWNrZXRVcmkgY29uZmlnIHBhcmFtZXRlciBvciBmcm9tIFdvcmtHcm91cFxuICAgICAqXG4gICAgICogQHJldHVybnMge1Byb21pc2U8c3RyaW5nPn0gUzMgQnVja2V0IFVSSVxuICAgICAqL1xuICAgIHB1YmxpYyBhc3luYyBnZXRPdXRwdXRTM0J1Y2tldCgpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgICAgICBsZXQgYnVja2V0OiBzdHJpbmc7XG5cbiAgICAgICAgaWYgKHRoaXMuY29uZmlnLmJ1Y2tldFVyaSAhPSBudWxsICYmIHRoaXMuY29uZmlnLmJ1Y2tldFVyaSAhPT0gJycpIHtcbiAgICAgICAgICAgIGJ1Y2tldCA9IHRoaXMuY29uZmlnLmJ1Y2tldFVyaTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmNvbmZpZy53b3JrR3JvdXAgIT0gbnVsbCB8fCB0aGlzLmNvbmZpZy53b3JrR3JvdXAgIT09ICcnKSB7XG4gICAgICAgICAgICBjb25zdCB3b3JrR3JvdXAgPSBhd2FpdCB0aGlzLmdldFdvcmtHcm91cERldGFpbHMoKTtcblxuICAgICAgICAgICAgYnVja2V0ID0gd29ya0dyb3VwLkNvbmZpZ3VyYXRpb24uUmVzdWx0Q29uZmlndXJhdGlvbi5PdXRwdXRMb2NhdGlvbjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignWW91IG11c3QgZGVmaW5lIGEgUzMgQnVja2V0IFVSSSBhbmQvb3IgYSBXb3JrR3JvdXAnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBidWNrZXQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyBleGVjdXRlUXVlcnlDb21tb24oc3FsOiBzdHJpbmcsIHBhcmFtZXRlcnM/OiBPYmplY3QsIGlkPzogc3RyaW5nKTogUHJvbWlzZTxRdWVyeT4ge1xuICAgICAgICBjb25zdCBxdWVyeSA9IG5ldyBRdWVyeShzcWwsIHBhcmFtZXRlcnMsIGlkKTtcbiAgICAgICAgcXVlcnkud2FpdFRpbWUgPSB0aGlzLmNvbmZpZy53YWl0VGltZTtcblxuICAgICAgICB0aGlzLnF1ZXVlLmFkZFF1ZXJ5KHF1ZXJ5KTtcblxuICAgICAgICBxdWVyeS5hdGhlbmFJZCA9IGF3YWl0IHRoaXMuc3RhcnRRdWVyeUV4ZWN1dGlvbihxdWVyeSk7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMud2FpdFVudGlsU3VjY2VlZFF1ZXJ5KHF1ZXJ5KTtcbiAgICAgICAgfSBjYXRjaCAoZXhjZXB0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLnF1ZXVlLnJlbW92ZVF1ZXJ5KHF1ZXJ5KTtcblxuICAgICAgICAgICAgdGhyb3cgZXhjZXB0aW9uO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFN0YXJ0cyBxdWVyeSBleGVjdXRpb24gYW5kIGdldHMgYW4gSUQgZm9yIHRoZSBvcGVyYXRpb25cbiAgICAgKlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHBhcmFtIHtRdWVyeX0gcXVlcnkgLSBBdGhlbmEgcmVxdWVzdCBwYXJhbXNcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxzdHJpbmc+fSAtIHF1ZXJ5IGV4ZWN1dGlvbiBpZFxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDbGllbnRcbiAgICAgKi9cbiAgICBwcml2YXRlIGFzeW5jIHN0YXJ0UXVlcnlFeGVjdXRpb24ocXVlcnk6IFF1ZXJ5KTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICAgICAgY29uc3QgcmVxdWVzdFBhcmFtczogQXRoZW5hLlR5cGVzLlN0YXJ0UXVlcnlFeGVjdXRpb25JbnB1dCA9IHtcbiAgICAgICAgICAgIFF1ZXJ5RXhlY3V0aW9uQ29udGV4dDoge1xuICAgICAgICAgICAgICAgIERhdGFiYXNlOiB0aGlzLmNvbmZpZy5kYXRhYmFzZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBRdWVyeVN0cmluZzogcXVlcnkuc3FsLFxuICAgICAgICAgICAgUmVzdWx0Q29uZmlndXJhdGlvbjoge1xuICAgICAgICAgICAgICAgIE91dHB1dExvY2F0aW9uOiB0aGlzLmNvbmZpZy5idWNrZXRVcmksXG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuXG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy53b3JrR3JvdXAgIT0gbnVsbCkge1xuICAgICAgICAgICAgcmVxdWVzdFBhcmFtcy5Xb3JrR3JvdXAgPSB0aGlzLmNvbmZpZy53b3JrR3JvdXA7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICB0aGlzLmNsaWVudC5zdGFydFF1ZXJ5RXhlY3V0aW9uKHJlcXVlc3RQYXJhbXMsIChlcnIsIGRhdGEpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKGRhdGEuUXVlcnlFeGVjdXRpb25JZCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUHJvY2Vzc2VzIHF1ZXJ5IHJlc3VsdHMgYW5kIHBhcnNlcyB0aGVtXG4gICAgICpcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqIEB0ZW1wbGF0ZSBUXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gcXVlcnlFeGVjdXRpb25JZCAtIHF1ZXJ5IGV4ZWN1dGlvbiBpZGVudGlmaWVyXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5leHRUb2tlblxuICAgICAqIEBwYXJhbSB7VFtdfSBwcmV2aW91c1Jlc3VsdHNcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPFRbXT59IC0gcGFyc2VkIHF1ZXJ5IHJlc3VsdCByb3dzXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNsaWVudFxuICAgICAqL1xuICAgIHByaXZhdGUgZ2V0UXVlcnlSZXN1bHRzPFQ+KHF1ZXJ5RXhlY3V0aW9uSWQ6IHN0cmluZywgbmV4dFRva2VuPzogc3RyaW5nLCBwcmV2aW91c1Jlc3VsdHM/OiBUW10pOiBQcm9taXNlPFRbXT4ge1xuICAgICAgICBjb25zdCByZXF1ZXN0UGFyYW1zOiBBdGhlbmEuVHlwZXMuR2V0UXVlcnlSZXN1bHRzSW5wdXQgPSB7XG4gICAgICAgICAgICBOZXh0VG9rZW46IG5leHRUb2tlbixcbiAgICAgICAgICAgIFF1ZXJ5RXhlY3V0aW9uSWQ6IHF1ZXJ5RXhlY3V0aW9uSWQsXG4gICAgICAgIH07XG5cbiAgICAgICAgbGV0IGNvbHVtbnM6IEF0aGVuYUNvbHVtbltdO1xuXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTxhbnk+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRoaXMuY2xpZW50LmdldFF1ZXJ5UmVzdWx0cyhyZXF1ZXN0UGFyYW1zLCBhc3luYyAoZXJyLCBkYXRhKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGVyciAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb2x1bW5zID0gdGhpcy5zZXRDb2x1bW5QYXJzZXJzKGRhdGEpO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgaXNGaXJzdFBhZ2UgPSAocHJldmlvdXNSZXN1bHRzID09IG51bGwgJiYgbmV4dFRva2VuID09IG51bGwpO1xuXG4gICAgICAgICAgICAgICAgbGV0IHJlc3VsdHMgPSB0aGlzLnBhcnNlUm93czxUPihkYXRhLlJlc3VsdFNldC5Sb3dzLCBjb2x1bW5zLCBpc0ZpcnN0UGFnZSk7XG5cbiAgICAgICAgICAgICAgICBpZiAocHJldmlvdXNSZXN1bHRzICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0cyA9IHByZXZpb3VzUmVzdWx0cy5jb25jYXQocmVzdWx0cyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGRhdGEuTmV4dFRva2VuICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZ2V0UXVlcnlSZXN1bHRzPFQ+KHF1ZXJ5RXhlY3V0aW9uSWQsIGRhdGEuTmV4dFRva2VuLCByZXN1bHRzKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3VsdHMpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBhcnNlcyByZXN1bHQgcm93c1xuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAdGVtcGxhdGUgVFxuICAgICAqIEBwYXJhbSB7QXRoZW5hLlJvd1tdfSByb3dzIC0gcXVlcnkgcmVzdWx0IHJvd3NcbiAgICAgKiBAcGFyYW0ge0F0aGVuYUNvbHVtbltdfSBjb2x1bW5zIC0gcXVlcnkgcmVzdWx0IGNvbHVtbnNcbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IGlzRmlyc3RQYWdlXG4gICAgICogQHJldHVybnMge1RbXX0gLSBwYXJzZWQgcmVzdWx0IGFjY29yZGluZyB0byBuZWVkZWQgcGFyc2VyXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNsaWVudFxuICAgICAqL1xuICAgIHByaXZhdGUgcGFyc2VSb3dzPFQ+KHJvd3M6IEF0aGVuYS5Sb3dbXSwgY29sdW1uczogQXRoZW5hQ29sdW1uW10sIGlzRmlyc3RQYWdlID0gZmFsc2UpOiBUW10ge1xuICAgICAgICBjb25zdCByZXN1bHRzOiBUW10gPSBbXTtcblxuICAgICAgICAvLyBTdGFydCB3aXRoIDEgd2hlbiBmaXJzdCBsaW5lIGlzIGNvbHVtbiB0aXRsZSAoaW4gZmlyc3QgcGFnZSlcbiAgICAgICAgZm9yIChsZXQgcm93SW5kZXggPSAoaXNGaXJzdFBhZ2UpID8gMSA6IDA7IHJvd0luZGV4IDwgcm93cy5sZW5ndGg7IHJvd0luZGV4KyspIHtcbiAgICAgICAgICAgIGNvbnN0IHJvdyA9IHJvd3Nbcm93SW5kZXhdO1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0OiBUID0gPFQ+e307XG5cbiAgICAgICAgICAgIGZvciAobGV0IHJvd0RhdGFJbmRleCA9IDA7IHJvd0RhdGFJbmRleCA8IHJvdy5EYXRhLmxlbmd0aDsgcm93RGF0YUluZGV4KyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCByb3dEYXRhID0gcm93LkRhdGFbcm93RGF0YUluZGV4XTtcbiAgICAgICAgICAgICAgICBjb25zdCBjb2x1bW4gPSBjb2x1bW5zW3Jvd0RhdGFJbmRleF07XG5cbiAgICAgICAgICAgICAgICBpZiAocm93RGF0YSAhPSBudWxsICYmIHJvd0RhdGEuVmFyQ2hhclZhbHVlICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0W2NvbHVtbi5uYW1lXSA9IGNvbHVtbi5wYXJzZShyb3dEYXRhLlZhckNoYXJWYWx1ZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0W2NvbHVtbi5uYW1lXSA9IG51bGw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXN1bHRzLnB1c2gocmVzdWx0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldCBhcHByb3ByaWF0ZSBjb2x1bW4gcGFyc2VycyBhY2NvcmRpbmcgdG8gY29sdW1ucycgZGF0YSB0eXBlXG4gICAgICpcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqIEBwYXJhbSB7Kn0gZGF0YSAtIHF1ZXJ5IHJlc3VsdHNcbiAgICAgKiBAcmV0dXJucyB7QXRoZW5hQ29sdW1uW119IC0gY29sdW1uIG5hbWUgYW5kIHBhcnNlciB0eXBlXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNsaWVudFxuICAgICAqL1xuICAgIHByaXZhdGUgc2V0Q29sdW1uUGFyc2VycyhkYXRhKTogQXRoZW5hQ29sdW1uW10ge1xuICAgICAgICBjb25zdCBjb2x1bW5zOiBBdGhlbmFDb2x1bW5bXSA9IFtdO1xuXG4gICAgICAgIGZvciAoY29uc3QgY29sdW1uSW5mbyBvZiBkYXRhLlJlc3VsdFNldC5SZXN1bHRTZXRNZXRhZGF0YS5Db2x1bW5JbmZvKSB7XG4gICAgICAgICAgICBjb25zdCBjb2x1bW4gPSBuZXcgQXRoZW5hQ29sdW1uKCk7XG4gICAgICAgICAgICBjb2x1bW4ubmFtZSA9IGNvbHVtbkluZm8uTmFtZTtcblxuICAgICAgICAgICAgc3dpdGNoIChjb2x1bW5JbmZvLlR5cGUgYXMgQXRoZW5hRGF0YVR5cGVFbnVtKSB7XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uSW50ZWdlcjpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5UaW55SW50OlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLlNtYWxsSW50OlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkJpZ0ludDpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5GbG9hdDpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5Eb3VibGU6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uRGVjaW1hbDpcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uLnBhcnNlID0gQXRoZW5hQ29sdW1uLnBhcnNlTnVtYmVyO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkNoYXI6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uVmFyY2hhcjpcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uLnBhcnNlID0gQXRoZW5hQ29sdW1uLnBhcnNlU3RyaW5nO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkJvb2xlYW46XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbi5wYXJzZSA9IEF0aGVuYUNvbHVtbi5wYXJzZUJvb2xlYW47XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uRGF0ZTpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5UaW1lc3RhbXA6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uVGltZXN0YW1wV2l0aFR6OlxuICAgICAgICAgICAgICAgICAgICBjb2x1bW4ucGFyc2UgPSBBdGhlbmFDb2x1bW4ucGFyc2VEYXRlO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkFycmF5OlxuICAgICAgICAgICAgICAgICAgICBjb2x1bW4ucGFyc2UgPSBBdGhlbmFDb2x1bW4ucGFyc2VBcnJheTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uSnNvbjpcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uLnBhcnNlID0gQXRoZW5hQ29sdW1uLnBhcnNlSnNvbjtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uQmluYXJ5OlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLk1hcDpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5TdHJ1Y3Q6XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb2x1bW4gdHlwZSAnJHtjb2x1bW5JbmZvLlR5cGV9JyBub3Qgc3VwcG9ydGVkYCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbHVtbnMucHVzaChjb2x1bW4pO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGNvbHVtbnM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2hlY2tzIHRoZSBxdWVyeSBleGVjdXRpb24gc3RhdHVzIHVudGlsIHRoZSBxdWVyeSBzZW5kcyBTVUNDRUVERUQgc2lnbmFsXG4gICAgICpcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqIEBwYXJhbSB7UXVlcnl9IHF1ZXJ5IC0gdGhlIHF1ZXJ5XG4gICAgICogQHJldHVybnMge1Byb21pc2U8dm9pZD59IC0gcHJvbWlzZSB0aGF0IHdpbGwgcmVzb2x2ZSBvbmNlIHRoZSBvcGVyYXRpb24gaGFzIGZpbmlzaGVkXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNsaWVudFxuICAgICAqL1xuICAgIHByaXZhdGUgYXN5bmMgd2FpdFVudGlsU3VjY2VlZFF1ZXJ5KHF1ZXJ5OiBRdWVyeSk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCByZXF1ZXN0UGFyYW1zOiBBdGhlbmEuVHlwZXMuR2V0UXVlcnlFeGVjdXRpb25JbnB1dCA9IHtcbiAgICAgICAgICAgIFF1ZXJ5RXhlY3V0aW9uSWQ6IHF1ZXJ5LmF0aGVuYUlkLFxuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICB0aGlzLmNsaWVudC5nZXRRdWVyeUV4ZWN1dGlvbihyZXF1ZXN0UGFyYW1zLCBhc3luYyAoZXJyLCBkYXRhKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGVyciAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBxdWVyeS5zdGF0dXMgPSBkYXRhLlF1ZXJ5RXhlY3V0aW9uLlN0YXR1cy5TdGF0ZTtcblxuICAgICAgICAgICAgICAgIHN3aXRjaCAocXVlcnkuc3RhdHVzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ1NVQ0NFRURFRCc6XG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdRVUVVRUQnOlxuICAgICAgICAgICAgICAgICAgICBjYXNlICdSVU5OSU5HJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHF1ZXJ5LndhaXRUaW1lKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgd2FpdFRpbWUgPSBxdWVyeS53YWl0VGltZSAqIDEwMDA7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuc2xlZXAod2FpdFRpbWUpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBxdWVyeS53YWl0VGltZSA9IHF1ZXJ5LndhaXRUaW1lICogMjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMud2FpdFVudGlsU3VjY2VlZFF1ZXJ5KHF1ZXJ5KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgICAgICAgcXVlcnkud2FpdFRpbWUgPSBNYXRoLnBvdyhxdWVyeS53YWl0VGltZSwgMik7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAgICAgICAgIGF3YWl0IHRoaXMud2FpdFVudGlsU3VjY2VlZFF1ZXJ5KHF1ZXJ5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgICAgICAgcmVqZWN0KGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIH0sIHdhaXRUaW1lKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnQ0FOQ0VMTEVEJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgUXVlcnlDYW5jZWxlZEV4Y2VwdGlvbigpKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ0ZBSUxFRCc6XG4gICAgICAgICAgICAgICAgICAgICAgICByZWplY3QobmV3IEF0aGVuYUNsaWVudEV4Y2VwdGlvbignUXVlcnkgZmFpbGVkJykpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgQXRoZW5hQ2xpZW50RXhjZXB0aW9uKGBRdWVyeSBTdGF0dXMgJyR7ZGF0YS5RdWVyeUV4ZWN1dGlvbi5TdGF0dXMuU3RhdGV9JyBub3Qgc3VwcG9ydGVkYCkpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzbGVlcChtczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZTogYW55KSA9PiB7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICB9LCBtcyk7XG4gICAgICAgIH0pO1xuICAgIH1cbn1cblxuLyoqXG4gKiBBdGhlbmFDb2x1bW4gY2xhc3NcbiAqXG4gKiBAY2xhc3MgQXRoZW5hQ29sdW1uXG4gKi9cbmNsYXNzIEF0aGVuYUNvbHVtbiB7XG4gICAgcHVibGljIG5hbWU6IHN0cmluZztcblxuICAgIHB1YmxpYyBwYXJzZTogKHZhbHVlOiBzdHJpbmcpID0+IGFueTtcblxuICAgIC8qKlxuICAgICAqIFBhcnNlcyBzdHJpbmcgdG8gbnVtYmVyXG4gICAgICpcbiAgICAgKiBAc3RhdGljXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHZhbHVlIC0gc3RyaW5nIHRvIHBhcnNlXG4gICAgICogQHJldHVybnMge251bWJlcn0gLSBwYXJzZWQgbnVtYmVyXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNvbHVtblxuICAgICAqL1xuICAgIHB1YmxpYyBzdGF0aWMgcGFyc2VOdW1iZXIodmFsdWU6IHN0cmluZyk6IG51bWJlciB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IE51bWJlcih2YWx1ZSk7XG5cbiAgICAgICAgaWYgKGlzTmFOKHJlc3VsdCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVGhlIHZhbHVlICcke3ZhbHVlfSAnaXMgbm90IGEgbnVtYmVyYCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBhcnNlcyBzdHJpbmdcbiAgICAgKlxuICAgICAqIEBzdGF0aWNcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdmFsdWUgLSBzdHJpbmcgdG8gcGFyc2VcbiAgICAgKiBAcmV0dXJucyB7c3RyaW5nfSAtIHBhcnNlZCBzdHJpbmdcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ29sdW1uXG4gICAgICovXG4gICAgcHVibGljIHN0YXRpYyBwYXJzZVN0cmluZyh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBhcnNlcyBib29sZWFuLWxpa2UgQXRoZW5hIGV4cHJlc3Npb24gdG8gYm9vbGVhblxuICAgICAqXG4gICAgICogQHN0YXRpY1xuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB2YWx1ZSAtIGJvb2xlYW4tbGlrZSBzdHJpbmdcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gLSBwYXJzZWQgc3RyaW5nXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNvbHVtblxuICAgICAqL1xuICAgIHB1YmxpYyBzdGF0aWMgcGFyc2VCb29sZWFuKHZhbHVlOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgIHZhbHVlID09PSAndHJ1ZSdcbiAgICAgICAgICAgIHx8IHZhbHVlID09PSAnVFJVRSdcbiAgICAgICAgICAgIHx8IHZhbHVlID09PSAndCdcbiAgICAgICAgICAgIHx8IHZhbHVlID09PSAnVCdcbiAgICAgICAgICAgIHx8IHZhbHVlID09PSAneWVzJ1xuICAgICAgICAgICAgfHwgdmFsdWUgPT09ICdZRVMnXG4gICAgICAgICAgICB8fCB2YWx1ZSA9PT0gJzEnXG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGFyc2VzIHN0cmluZyB0byBkYXRlXG4gICAgICpcbiAgICAgKiBAc3RhdGljXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHZhbHVlIC0gc3RyaW5nIHRvIHBhcnNlXG4gICAgICogQHJldHVybnMge0RhdGV9IC0gcGFyc2VkIGRhdGVcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ29sdW1uXG4gICAgICovXG4gICAgcHVibGljIHN0YXRpYyBwYXJzZURhdGUodmFsdWU6IHN0cmluZyk6IERhdGUge1xuICAgICAgICByZXR1cm4gbmV3IERhdGUodmFsdWUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBhcnNlcyBzdHJpbmcgdG8gYXJyYXlcbiAgICAgKlxuICAgICAqIEBzdGF0aWNcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gYXJyYXlJblN0cmluZyAtIHN0cmluZyB0byBwYXJzZVxuICAgICAqIEByZXR1cm5zIHthbnlbXX0gLSBwYXJzZWQgYXJyYXlcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ29sdW1uXG4gICAgICovXG4gICAgcHVibGljIHN0YXRpYyBwYXJzZUFycmF5KGFycmF5SW5TdHJpbmc6IHN0cmluZyk6IG51bWJlcltdIHwgc3RyaW5nW10ge1xuICAgICAgICBhcnJheUluU3RyaW5nID0gYXJyYXlJblN0cmluZy5yZXBsYWNlKC9cXFt8XFxdL2dpLCAnJyk7XG5cbiAgICAgICAgaWYgKGFycmF5SW5TdHJpbmcgPT0gbnVsbCB8fCBhcnJheUluU3RyaW5nID09PSAnJykge1xuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdmFsdWVzID0gYXJyYXlJblN0cmluZy5zcGxpdCgnLCAnKTtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gW107XG5cbiAgICAgICAgZm9yIChjb25zdCB2YWx1ZSBvZiB2YWx1ZXMpIHtcbiAgICAgICAgICAgIGxldCBudW1iZXJWYWx1ZSA9IE51bWJlcih2YWx1ZSk7XG5cbiAgICAgICAgICAgIGlmICghTnVtYmVyLmlzTmFOKG51bWJlclZhbHVlKSkge1xuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKG51bWJlclZhbHVlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2godmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQYXJzZXMgc3RyaW5nIHRvIGFycmF5XG4gICAgICpcbiAgICAgKiBAc3RhdGljXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHZhbHVlIC0gc3RyaW5nIHRvIHBhcnNlXG4gICAgICogQHJldHVybnMge2FueVtdfSAtIHBhcnNlZCBhcnJheVxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDb2x1bW5cbiAgICAgKi9cbiAgICBwdWJsaWMgc3RhdGljIHBhcnNlSnNvbih2YWx1ZTogc3RyaW5nKTogYW55W10ge1xuICAgICAgICByZXR1cm4gSlNPTi5wYXJzZSh2YWx1ZSk7XG4gICAgfVxufVxuIl19
