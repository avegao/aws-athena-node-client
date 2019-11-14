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
    AthenaDataTypeEnum["String"] = "string";
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
        this._config = config;
        this._config.awsConfig.apiVersion = '2017-05-18';
        this._client = new aws_sdk_1.Athena(this._config.awsConfig);
        this._queue = new Queue_1.Queue();
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
            accessKeyId: this._config.awsConfig.accessKeyId,
            secretAccessKey: this._config.awsConfig.secretAccessKey,
        });
        return s3.getSignedUrl('getObject', {
            Bucket: s3Object.Bucket,
            Expires: expiration,
            Key: s3Object.Key,
        });
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
        const query = this._queue.getQueryById(id);
        const requestParams = {
            QueryExecutionId: query.athenaId,
        };
        return new Promise((resolve, reject) => {
            this._client.stopQueryExecution(requestParams, (err, data) => {
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
        if (this._config.workGroup == null || this._config.workGroup === '') {
            throw new Error('You must define an AWS Athena WorkGroup');
        }
        const parameters = {
            WorkGroup: this._config.workGroup,
        };
        return new Promise((resolve, reject) => {
            this._client.getWorkGroup(parameters, ((err, data) => {
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
        if (this._config.bucketUri != null && this._config.bucketUri !== '') {
            bucket = this._config.bucketUri;
        }
        else if (this._config.workGroup != null || this._config.workGroup !== '') {
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
        this._queue.addQuery(query);
        query.athenaId = await this.startQueryExecution(query);
        try {
            await this.waitUntilSucceedQuery(query);
        }
        catch (exception) {
            this._queue.removeQuery(query);
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
                Database: this._config.database,
            },
            QueryString: query.sql,
            ResultConfiguration: {
                OutputLocation: this._config.bucketUri,
            },
        };
        if (this._config.workGroup != null) {
            requestParams.WorkGroup = this._config.workGroup;
        }
        return new Promise((resolve, reject) => {
            this._client.startQueryExecution(requestParams, (err, data) => {
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
            this._client.getQueryResults(requestParams, async (err, data) => {
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
        var _a;
        const results = [];
        // Start with 1 when first line is column title (in first page)
        for (let rowIndex = (isFirstPage) ? 1 : 0, len = rows.length; rowIndex < len; rowIndex++) {
            const row = rows[rowIndex];
            const result = {};
            for (let rowDataIndex = 0; rowDataIndex < row.Data.length; rowDataIndex++) {
                const rowData = row.Data[rowDataIndex];
                const column = columns[rowDataIndex];
                if (((_a = rowData) === null || _a === void 0 ? void 0 : _a.VarCharValue) != null) {
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
                case AthenaDataTypeEnum.String:
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
        const waitTime = this._config.waitTime * 1000;
        return new Promise((resolve, reject) => {
            const interval = setInterval(() => {
                this._client.getQueryExecution(requestParams, (err, data) => {
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

//# sourceMappingURL=data:application/json;charset=utf8;base64,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Q0FBQztxQkFDdEI7b0JBRUQsS0FBSyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7b0JBRWhELFFBQVEsS0FBSyxDQUFDLE1BQU0sRUFBRTt3QkFDbEIsS0FBSyxXQUFXOzRCQUNaLFNBQVMsRUFBRSxDQUFDOzRCQUNaLE1BQU07d0JBQ1YsS0FBSyxRQUFRLENBQUM7d0JBQ2QsS0FBSyxTQUFTOzRCQUNWLE1BQU07d0JBQ1YsS0FBSyxXQUFXOzRCQUNaLE9BQU8sQ0FBQyxJQUFJLCtDQUFzQixFQUFFLENBQUMsQ0FBQzs0QkFDdEMsTUFBTTt3QkFDVixLQUFLLFFBQVE7NEJBQ1QsT0FBTyxDQUFDLElBQUksNkNBQXFCLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQzs0QkFDbkQsTUFBTTt3QkFDVjs0QkFDSSxPQUFPLENBQUMsSUFBSSw2Q0FBcUIsQ0FBQyxpQkFBaUIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsS0FBSyxpQkFBaUIsQ0FBQyxDQUFDLENBQUM7NEJBQ3ZHLE1BQU07cUJBQ2I7Z0JBQ0wsQ0FBQyxDQUFDLENBQUM7WUFDUCxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFFYixNQUFNLFNBQVMsR0FBRyxHQUFHLEVBQUU7Z0JBQ25CLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDeEIsT0FBTyxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUM7WUFFRixNQUFNLE9BQU8sR0FBRyxDQUFDLEdBQUcsRUFBRSxFQUFFO2dCQUNwQixhQUFhLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ3hCLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNoQixDQUFDLENBQUM7UUFDTixDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7Q0FDSjtBQXhZRCxvQ0F3WUMiLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge0F0aGVuYX0gZnJvbSAnYXdzLXNkayc7XG5pbXBvcnQge0F0aGVuYUNsaWVudENvbmZpZ30gZnJvbSAnLi9BdGhlbmFDbGllbnRDb25maWcnO1xuaW1wb3J0IHtRdWV1ZX0gZnJvbSAnLi9RdWV1ZSc7XG5pbXBvcnQge1F1ZXJ5fSBmcm9tICcuL1F1ZXJ5JztcbmltcG9ydCB7QXRoZW5hQ2xpZW50RXhjZXB0aW9ufSBmcm9tICcuL2V4Y2VwdGlvbi9BdGhlbmFDbGllbnRFeGNlcHRpb24nO1xuaW1wb3J0IHtRdWVyeUNhbmNlbGVkRXhjZXB0aW9ufSBmcm9tICcuL2V4Y2VwdGlvbi9RdWVyeUNhbmNlbGVkRXhjZXB0aW9uJztcbmltcG9ydCB7Q29sdW1ufSBmcm9tICcuL0NvbHVtbic7XG5pbXBvcnQgKiBhcyBTMyBmcm9tICdhd3Mtc2RrL2NsaWVudHMvczMnO1xuaW1wb3J0IHtjb25maWcgYXMgYXdzQ29uZmlnfSBmcm9tICdhd3Mtc2RrJztcbmltcG9ydCAqIGFzIHMzdXJscyBmcm9tICdAbWFwYm94L3MzdXJscyc7XG5cbmNvbnN0IGV4cGlyYXRpb24xRGF5ID0gNjAgKiA2MCAqIDI0O1xuXG5lbnVtIEF0aGVuYURhdGFUeXBlRW51bSB7XG4gICAgSW50ZWdlciA9ICdpbnRlZ2VyJyxcbiAgICBGbG9hdCA9ICdmbG9hdCcsXG4gICAgRG91YmxlID0gJ2RvdWJsZScsXG4gICAgRGVjaW1hbCA9ICdkZWNpbWFsJyxcbiAgICBDaGFyID0gJ2NoYXInLFxuICAgIFZhcmNoYXIgPSAndmFyY2hhcicsXG4gICAgQm9vbGVhbiA9ICdib29sZWFuJyxcbiAgICBCaW5hcnkgPSAnYmluYXJ5JyxcbiAgICBEYXRlID0gJ2RhdGUnLFxuICAgIFRpbWVzdGFtcCA9ICd0aW1lc3RhbXAnLFxuICAgIFRpbWVzdGFtcFdpdGhUeiA9ICd0aW1lc3RhbXAgd2l0aCB0aW1lIHpvbmUnLFxuICAgIEFycmF5ID0gJ2FycmF5JyxcbiAgICBKc29uID0gJ2pzb24nLFxuICAgIE1hcCA9ICdtYXAnLFxuICAgIFN0cmluZyA9ICdzdHJpbmcnLFxuICAgIFN0cnVjdCA9ICdzdHJ1Y3QnLFxuICAgIFRpbnlJbnQgPSAndGlueWludCcsXG4gICAgU21hbGxJbnQgPSAnc21hbGxpbnQnLFxuICAgIEJpZ0ludCA9ICdiaWdpbnQnLFxufVxuXG4vKipcbiAqIEF0aGVuYUNsaWVudCBjbGFzc1xuICpcbiAqIEBleHBvcnRcbiAqIEBjbGFzcyBBdGhlbmFDbGllbnRcbiAqL1xuZXhwb3J0IGNsYXNzIEF0aGVuYUNsaWVudCB7XG4gICAgcHJpdmF0ZSByZWFkb25seSBfY2xpZW50OiBBdGhlbmE7XG4gICAgcHJpdmF0ZSByZWFkb25seSBfY29uZmlnOiBBdGhlbmFDbGllbnRDb25maWc7XG5cbiAgICBwcml2YXRlIF9xdWV1ZTogUXVldWU7XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGVzIGFuIGluc3RhbmNlIG9mIEF0aGVuYUNsaWVudC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7QXRoZW5hQ2xpZW50Q29uZmlnfSBjb25maWcgLSBDb25maWcgZm9yIEFXUyBBdGhlbmFcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGNvbmZpZzogQXRoZW5hQ2xpZW50Q29uZmlnKSB7XG4gICAgICAgIHRoaXMuX2NvbmZpZyA9IGNvbmZpZztcbiAgICAgICAgdGhpcy5fY29uZmlnLmF3c0NvbmZpZy5hcGlWZXJzaW9uID0gJzIwMTctMDUtMTgnO1xuXG4gICAgICAgIHRoaXMuX2NsaWVudCA9IG5ldyBBdGhlbmEodGhpcy5fY29uZmlnLmF3c0NvbmZpZyk7XG4gICAgICAgIHRoaXMuX3F1ZXVlID0gbmV3IFF1ZXVlKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBxdWVyeSBpbiBBdGhlbmFcbiAgICAgKlxuICAgICAqIEB0ZW1wbGF0ZSBUXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gc3FsIC0gcXVlcnkgdG8gZXhlY3V0ZSwgYXMgc3RyaW5nXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHBhcmFtZXRlcnMgLSBwYXJhbWV0ZXJzIGZvciBxdWVyeVxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBpZCAtIFlvdXIgY3VzdG9tIElEXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxUW10+fSAtIHBhcnNlZCBxdWVyeSByZXN1bHRzXG4gICAgICpcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHVibGljIGFzeW5jIGV4ZWN1dGVRdWVyeTxUPihzcWw6IHN0cmluZywgcGFyYW1ldGVycz86IE9iamVjdCwgaWQ/OiBzdHJpbmcpOiBQcm9taXNlPFRbXT4ge1xuICAgICAgICBjb25zdCBxdWVyeSA9IGF3YWl0IHRoaXMuZXhlY3V0ZVF1ZXJ5Q29tbW9uKHNxbCwgcGFyYW1ldGVycywgaWQpO1xuXG4gICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmdldFF1ZXJ5UmVzdWx0cyhxdWVyeSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZSBxdWVyeSBpbiBBdGhlbmEgYW5kIGdldCBTMyBVUkwgd2l0aCBDU1YgZmlsZVxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHNxbCAtIHF1ZXJ5IHRvIGV4ZWN1dGUsIGFzIHN0cmluZ1xuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBwYXJhbWV0ZXJzIC0gcGFyYW1ldGVycyBmb3IgcXVlcnlcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gaWQgLSBZb3VyIGN1c3RvbSBJRFxuICAgICAqXG4gICAgICogQHJldHVybnMge1Byb21pc2U8c3RyaW5nPn0gLSBTMyBVUkxcbiAgICAgKlxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDbGllbnRcbiAgICAgKi9cbiAgICBwdWJsaWMgYXN5bmMgZXhlY3V0ZVF1ZXJ5QW5kR2V0UzNVcmwoc3FsOiBzdHJpbmcsIHBhcmFtZXRlcnM/OiBPYmplY3QsIGlkPzogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICAgICAgY29uc3QgcXVlcnkgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeUNvbW1vbihzcWwsIHBhcmFtZXRlcnMsIGlkKTtcbiAgICAgICAgY29uc3QgczNCdWNrZXRVcmkgPSBhd2FpdCB0aGlzLmdldE91dHB1dFMzQnVja2V0KCk7XG5cbiAgICAgICAgcmV0dXJuIGAke3MzQnVja2V0VXJpfSR7cXVlcnkuYXRoZW5hSWR9LmNzdmA7XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIGV4ZWN1dGVRdWVyeUFuZEdldERvd25sb2FkU2lnbmVkVXJsKHNxbDogc3RyaW5nLCBwYXJhbWV0ZXJzPzogT2JqZWN0LCBpZD86IHN0cmluZywgZXhwaXJhdGlvbiA9IGV4cGlyYXRpb24xRGF5KTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICAgICAgY29uc3QgczNVcmwgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeUFuZEdldFMzVXJsKHNxbCwgcGFyYW1ldGVycywgaWQpO1xuICAgICAgICBjb25zdCBzM09iamVjdCA9IHMzdXJscy5mcm9tVXJsKHMzVXJsKTtcblxuICAgICAgICBjb25zdCBzMyA9IG5ldyBTMygpO1xuICAgICAgICBhd3NDb25maWcudXBkYXRlKHtcbiAgICAgICAgICAgIGFjY2Vzc0tleUlkOiB0aGlzLl9jb25maWcuYXdzQ29uZmlnLmFjY2Vzc0tleUlkLFxuICAgICAgICAgICAgc2VjcmV0QWNjZXNzS2V5OiB0aGlzLl9jb25maWcuYXdzQ29uZmlnLnNlY3JldEFjY2Vzc0tleSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHMzLmdldFNpZ25lZFVybCgnZ2V0T2JqZWN0Jywge1xuICAgICAgICAgICAgQnVja2V0OiBzM09iamVjdC5CdWNrZXQsXG4gICAgICAgICAgICBFeHBpcmVzOiBleHBpcmF0aW9uLFxuICAgICAgICAgICAgS2V5OiBzM09iamVjdC5LZXksXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENhbmNlbCBhIEFXUyBBdGhlbmEgcXVlcnlcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBpZCBZb3VyIGN1c3RvbSBJRFxuICAgICAqXG4gICAgICogQHJldHVybnMge1Byb21pc2U8dm9pZD59XG4gICAgICpcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHVibGljIGFzeW5jIGNhbmNlbFF1ZXJ5KGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgcXVlcnkgPSB0aGlzLl9xdWV1ZS5nZXRRdWVyeUJ5SWQoaWQpO1xuICAgICAgICBjb25zdCByZXF1ZXN0UGFyYW1zOiBBdGhlbmEuVHlwZXMuU3RvcFF1ZXJ5RXhlY3V0aW9uSW5wdXQgPSB7XG4gICAgICAgICAgICBRdWVyeUV4ZWN1dGlvbklkOiBxdWVyeS5hdGhlbmFJZCxcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5fY2xpZW50LnN0b3BRdWVyeUV4ZWN1dGlvbihyZXF1ZXN0UGFyYW1zLCAoZXJyLCBkYXRhKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGVyciAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IFdvcmtHcm91cCBkZXRhaWxzXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxBdGhlbmEuV29ya0dyb3VwPn0gQVdTIFdvcmtHcm91cCBPYmplY3RcbiAgICAgKi9cbiAgICBwdWJsaWMgYXN5bmMgZ2V0V29ya0dyb3VwRGV0YWlscygpOiBQcm9taXNlPEF0aGVuYS5Xb3JrR3JvdXA+IHtcbiAgICAgICAgaWYgKHRoaXMuX2NvbmZpZy53b3JrR3JvdXAgPT0gbnVsbCB8fCB0aGlzLl9jb25maWcud29ya0dyb3VwID09PSAnJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdZb3UgbXVzdCBkZWZpbmUgYW4gQVdTIEF0aGVuYSBXb3JrR3JvdXAnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHBhcmFtZXRlcnM6IEF0aGVuYS5HZXRXb3JrR3JvdXBJbnB1dCA9IHtcbiAgICAgICAgICAgIFdvcmtHcm91cDogdGhpcy5fY29uZmlnLndvcmtHcm91cCxcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8QXRoZW5hLldvcmtHcm91cD4oKHJlc29sdmU6IEZ1bmN0aW9uLCByZWplY3Q6IEZ1bmN0aW9uKSA9PiB7XG4gICAgICAgICAgICB0aGlzLl9jbGllbnQuZ2V0V29ya0dyb3VwKHBhcmFtZXRlcnMsICgoZXJyOiBFcnJvciwgZGF0YTogQXRoZW5hLkdldFdvcmtHcm91cE91dHB1dCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUoZGF0YS5Xb3JrR3JvdXApO1xuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgb3V0cHV0IFMzIGJ1Y2tldCBmcm9tIGJ1Y2tldFVyaSBjb25maWcgcGFyYW1ldGVyIG9yIGZyb20gV29ya0dyb3VwXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxzdHJpbmc+fSBTMyBCdWNrZXQgVVJJXG4gICAgICovXG4gICAgcHVibGljIGFzeW5jIGdldE91dHB1dFMzQnVja2V0KCk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgICAgIGxldCBidWNrZXQ6IHN0cmluZztcblxuICAgICAgICBpZiAodGhpcy5fY29uZmlnLmJ1Y2tldFVyaSAhPSBudWxsICYmIHRoaXMuX2NvbmZpZy5idWNrZXRVcmkgIT09ICcnKSB7XG4gICAgICAgICAgICBidWNrZXQgPSB0aGlzLl9jb25maWcuYnVja2V0VXJpO1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuX2NvbmZpZy53b3JrR3JvdXAgIT0gbnVsbCB8fCB0aGlzLl9jb25maWcud29ya0dyb3VwICE9PSAnJykge1xuICAgICAgICAgICAgY29uc3Qgd29ya0dyb3VwID0gYXdhaXQgdGhpcy5nZXRXb3JrR3JvdXBEZXRhaWxzKCk7XG5cbiAgICAgICAgICAgIGJ1Y2tldCA9IHdvcmtHcm91cC5Db25maWd1cmF0aW9uLlJlc3VsdENvbmZpZ3VyYXRpb24uT3V0cHV0TG9jYXRpb247XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1lvdSBtdXN0IGRlZmluZSBhIFMzIEJ1Y2tldCBVUkkgYW5kL29yIGEgV29ya0dyb3VwJyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYnVja2V0O1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgZXhlY3V0ZVF1ZXJ5Q29tbW9uKHNxbDogc3RyaW5nLCBwYXJhbWV0ZXJzPzogT2JqZWN0LCBpZD86IHN0cmluZyk6IFByb21pc2U8UXVlcnk+IHtcbiAgICAgICAgY29uc3QgcXVlcnkgPSBuZXcgUXVlcnkoc3FsLCBwYXJhbWV0ZXJzLCBpZCk7XG5cbiAgICAgICAgdGhpcy5fcXVldWUuYWRkUXVlcnkocXVlcnkpO1xuXG4gICAgICAgIHF1ZXJ5LmF0aGVuYUlkID0gYXdhaXQgdGhpcy5zdGFydFF1ZXJ5RXhlY3V0aW9uKHF1ZXJ5KTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy53YWl0VW50aWxTdWNjZWVkUXVlcnkocXVlcnkpO1xuICAgICAgICB9IGNhdGNoIChleGNlcHRpb24pIHtcbiAgICAgICAgICAgIHRoaXMuX3F1ZXVlLnJlbW92ZVF1ZXJ5KHF1ZXJ5KTtcblxuICAgICAgICAgICAgdGhyb3cgZXhjZXB0aW9uO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFN0YXJ0cyBxdWVyeSBleGVjdXRpb24gYW5kIGdldHMgYW4gSUQgZm9yIHRoZSBvcGVyYXRpb25cbiAgICAgKlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHBhcmFtIHtRdWVyeX0gcXVlcnkgLSBBdGhlbmEgcmVxdWVzdCBwYXJhbXNcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxzdHJpbmc+fSAtIHF1ZXJ5IGV4ZWN1dGlvbiBpZFxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDbGllbnRcbiAgICAgKi9cbiAgICBwcml2YXRlIGFzeW5jIHN0YXJ0UXVlcnlFeGVjdXRpb24ocXVlcnk6IFF1ZXJ5KTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICAgICAgY29uc3QgcmVxdWVzdFBhcmFtczogQXRoZW5hLlR5cGVzLlN0YXJ0UXVlcnlFeGVjdXRpb25JbnB1dCA9IHtcbiAgICAgICAgICAgIFF1ZXJ5RXhlY3V0aW9uQ29udGV4dDoge1xuICAgICAgICAgICAgICAgIERhdGFiYXNlOiB0aGlzLl9jb25maWcuZGF0YWJhc2UsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgUXVlcnlTdHJpbmc6IHF1ZXJ5LnNxbCxcbiAgICAgICAgICAgIFJlc3VsdENvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICAgICAgICBPdXRwdXRMb2NhdGlvbjogdGhpcy5fY29uZmlnLmJ1Y2tldFVyaSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKHRoaXMuX2NvbmZpZy53b3JrR3JvdXAgIT0gbnVsbCkge1xuICAgICAgICAgICAgcmVxdWVzdFBhcmFtcy5Xb3JrR3JvdXAgPSB0aGlzLl9jb25maWcud29ya0dyb3VwO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHN0cmluZz4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5fY2xpZW50LnN0YXJ0UXVlcnlFeGVjdXRpb24ocmVxdWVzdFBhcmFtcywgKGVyciwgZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmUoZGF0YS5RdWVyeUV4ZWN1dGlvbklkKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQcm9jZXNzZXMgcXVlcnkgcmVzdWx0cyBhbmQgcGFyc2VzIHRoZW1cbiAgICAgKlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHRlbXBsYXRlIFRcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7UXVlcnk8VD59IHF1ZXJ5XG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG5leHRUb2tlblxuICAgICAqIEBwYXJhbSB7VFtdfSBwcmV2aW91c1Jlc3VsdHNcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPFRbXT59IC0gcGFyc2VkIHF1ZXJ5IHJlc3VsdCByb3dzXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNsaWVudFxuICAgICAqL1xuICAgIHByaXZhdGUgZ2V0UXVlcnlSZXN1bHRzPFQ+KHF1ZXJ5OiBRdWVyeTxUPiwgbmV4dFRva2VuPzogc3RyaW5nLCBwcmV2aW91c1Jlc3VsdHM/OiBUW10pOiBQcm9taXNlPFRbXT4ge1xuICAgICAgICBjb25zdCByZXF1ZXN0UGFyYW1zOiBBdGhlbmEuVHlwZXMuR2V0UXVlcnlSZXN1bHRzSW5wdXQgPSB7XG4gICAgICAgICAgICBOZXh0VG9rZW46IG5leHRUb2tlbixcbiAgICAgICAgICAgIFF1ZXJ5RXhlY3V0aW9uSWQ6IHF1ZXJ5LmF0aGVuYUlkLFxuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTxUW10+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRoaXMuX2NsaWVudC5nZXRRdWVyeVJlc3VsdHMocmVxdWVzdFBhcmFtcywgYXN5bmMgKGVyciwgZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKCFxdWVyeS5oYXNDb2x1bW5zKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcXVlcnkuY29sdW1ucyA9IHRoaXMuc2V0Q29sdW1uUGFyc2VycyhkYXRhKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBpc0ZpcnN0UGFnZSA9ICFxdWVyeS5oYXNSZXN1bHRzKCkgJiYgbmV4dFRva2VuID09IG51bGw7XG5cbiAgICAgICAgICAgICAgICBxdWVyeS5yZXN1bHRzLnB1c2goLi4udGhpcy5wYXJzZVJvd3M8VD4oZGF0YS5SZXN1bHRTZXQuUm93cywgcXVlcnkuY29sdW1ucywgaXNGaXJzdFBhZ2UpKTtcblxuICAgICAgICAgICAgICAgIGlmIChkYXRhLk5leHRUb2tlbiAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LnJlc3VsdHMgPSBhd2FpdCB0aGlzLmdldFF1ZXJ5UmVzdWx0czxUPihxdWVyeSwgZGF0YS5OZXh0VG9rZW4pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJlc29sdmUocXVlcnkucmVzdWx0cyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGFyc2VzIHJlc3VsdCByb3dzXG4gICAgICpcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqIEB0ZW1wbGF0ZSBUXG4gICAgICogQHBhcmFtIHtBdGhlbmEuUm93W119IHJvd3MgLSBxdWVyeSByZXN1bHQgcm93c1xuICAgICAqIEBwYXJhbSB7Q29sdW1uW119IGNvbHVtbnMgLSBxdWVyeSByZXN1bHQgY29sdW1uc1xuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gaXNGaXJzdFBhZ2VcbiAgICAgKiBAcmV0dXJucyB7VFtdfSAtIHBhcnNlZCByZXN1bHQgYWNjb3JkaW5nIHRvIG5lZWRlZCBwYXJzZXJcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHJpdmF0ZSBwYXJzZVJvd3M8VD4ocm93czogQXRoZW5hLlJvd1tdLCBjb2x1bW5zOiBDb2x1bW5bXSwgaXNGaXJzdFBhZ2UgPSBmYWxzZSk6IFRbXSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdHM6IFRbXSA9IFtdO1xuXG4gICAgICAgIC8vIFN0YXJ0IHdpdGggMSB3aGVuIGZpcnN0IGxpbmUgaXMgY29sdW1uIHRpdGxlIChpbiBmaXJzdCBwYWdlKVxuICAgICAgICBmb3IgKGxldCByb3dJbmRleCA9IChpc0ZpcnN0UGFnZSkgPyAxIDogMCwgbGVuID0gcm93cy5sZW5ndGg7IHJvd0luZGV4IDwgbGVuOyByb3dJbmRleCsrKSB7XG4gICAgICAgICAgICBjb25zdCByb3cgPSByb3dzW3Jvd0luZGV4XTtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogVCA9IHt9IGFzIFQ7XG5cbiAgICAgICAgICAgIGZvciAobGV0IHJvd0RhdGFJbmRleCA9IDA7IHJvd0RhdGFJbmRleCA8IHJvdy5EYXRhLmxlbmd0aDsgcm93RGF0YUluZGV4KyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCByb3dEYXRhID0gcm93LkRhdGFbcm93RGF0YUluZGV4XTtcbiAgICAgICAgICAgICAgICBjb25zdCBjb2x1bW4gPSBjb2x1bW5zW3Jvd0RhdGFJbmRleF07XG5cbiAgICAgICAgICAgICAgICBpZiAocm93RGF0YT8uVmFyQ2hhclZhbHVlICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0W2NvbHVtbi5uYW1lXSA9IGNvbHVtbi5wYXJzZShyb3dEYXRhLlZhckNoYXJWYWx1ZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0W2NvbHVtbi5uYW1lXSA9IG51bGw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXN1bHRzLnB1c2gocmVzdWx0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldCBhcHByb3ByaWF0ZSBjb2x1bW4gcGFyc2VycyBhY2NvcmRpbmcgdG8gY29sdW1ucycgZGF0YSB0eXBlXG4gICAgICpcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqIEBwYXJhbSB7Kn0gZGF0YSAtIHF1ZXJ5IHJlc3VsdHNcbiAgICAgKiBAcmV0dXJucyB7Q29sdW1uW119IC0gY29sdW1uIG5hbWUgYW5kIHBhcnNlciB0eXBlXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNsaWVudFxuICAgICAqL1xuICAgIHByaXZhdGUgc2V0Q29sdW1uUGFyc2VycyhkYXRhKTogQ29sdW1uW10ge1xuICAgICAgICBjb25zdCBjb2x1bW5zOiBDb2x1bW5bXSA9IFtdO1xuXG4gICAgICAgIGZvciAoY29uc3QgY29sdW1uSW5mbyBvZiBkYXRhLlJlc3VsdFNldC5SZXN1bHRTZXRNZXRhZGF0YS5Db2x1bW5JbmZvKSB7XG4gICAgICAgICAgICBjb25zdCBjb2x1bW4gPSBuZXcgQ29sdW1uKCk7XG4gICAgICAgICAgICBjb2x1bW4ubmFtZSA9IGNvbHVtbkluZm8uTmFtZTtcblxuICAgICAgICAgICAgc3dpdGNoIChjb2x1bW5JbmZvLlR5cGUgYXMgQXRoZW5hRGF0YVR5cGVFbnVtKSB7XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uSW50ZWdlcjpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5UaW55SW50OlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLlNtYWxsSW50OlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkJpZ0ludDpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5GbG9hdDpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5Eb3VibGU6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uRGVjaW1hbDpcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uLnBhcnNlID0gQ29sdW1uLnBhcnNlTnVtYmVyO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkNoYXI6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uVmFyY2hhcjpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5TdHJpbmc6XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbi5wYXJzZSA9IENvbHVtbi5wYXJzZVN0cmluZztcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5Cb29sZWFuOlxuICAgICAgICAgICAgICAgICAgICBjb2x1bW4ucGFyc2UgPSBDb2x1bW4ucGFyc2VCb29sZWFuO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkRhdGU6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uVGltZXN0YW1wOlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLlRpbWVzdGFtcFdpdGhUejpcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uLnBhcnNlID0gQ29sdW1uLnBhcnNlRGF0ZTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5BcnJheTpcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uLnBhcnNlID0gQ29sdW1uLnBhcnNlQXJyYXk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkpzb246XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbi5wYXJzZSA9IENvbHVtbi5wYXJzZUpzb247XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkJpbmFyeTpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5NYXA6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uU3RydWN0OlxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ29sdW1uIHR5cGUgJyR7Y29sdW1uSW5mby5UeXBlfScgbm90IHN1cHBvcnRlZGApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb2x1bW5zLnB1c2goY29sdW1uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBjb2x1bW5zO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENoZWNrcyB0aGUgcXVlcnkgZXhlY3V0aW9uIHN0YXR1cyB1bnRpbCB0aGUgcXVlcnkgc2VuZHMgU1VDQ0VFREVEIHNpZ25hbFxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAcGFyYW0ge1F1ZXJ5fSBxdWVyeSAtIHRoZSBxdWVyeVxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fSAtIHByb21pc2UgdGhhdCB3aWxsIHJlc29sdmUgb25jZSB0aGUgb3BlcmF0aW9uIGhhcyBmaW5pc2hlZFxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDbGllbnRcbiAgICAgKi9cbiAgICBwcml2YXRlIGFzeW5jIHdhaXRVbnRpbFN1Y2NlZWRRdWVyeShxdWVyeTogUXVlcnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgcmVxdWVzdFBhcmFtczogQXRoZW5hLlR5cGVzLkdldFF1ZXJ5RXhlY3V0aW9uSW5wdXQgPSB7XG4gICAgICAgICAgICBRdWVyeUV4ZWN1dGlvbklkOiBxdWVyeS5hdGhlbmFJZCxcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCB3YWl0VGltZSA9IHRoaXMuX2NvbmZpZy53YWl0VGltZSAqIDEwMDA7XG5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGludGVydmFsID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuX2NsaWVudC5nZXRRdWVyeUV4ZWN1dGlvbihyZXF1ZXN0UGFyYW1zLCAoZXJyLCBkYXRhKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgcXVlcnkuc3RhdHVzID0gZGF0YS5RdWVyeUV4ZWN1dGlvbi5TdGF0dXMuU3RhdGU7XG5cbiAgICAgICAgICAgICAgICAgICAgc3dpdGNoIChxdWVyeS5zdGF0dXMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ1NVQ0NFRURFRCc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VlZGVkKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdRVUVVRUQnOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnUlVOTklORyc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdDQU5DRUxMRUQnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yZWQobmV3IFF1ZXJ5Q2FuY2VsZWRFeGNlcHRpb24oKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdGQUlMRUQnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yZWQobmV3IEF0aGVuYUNsaWVudEV4Y2VwdGlvbignUXVlcnkgZmFpbGVkJykpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcmVkKG5ldyBBdGhlbmFDbGllbnRFeGNlcHRpb24oYFF1ZXJ5IFN0YXR1cyAnJHtkYXRhLlF1ZXJ5RXhlY3V0aW9uLlN0YXR1cy5TdGF0ZX0nIG5vdCBzdXBwb3J0ZWRgKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIHdhaXRUaW1lKTtcblxuICAgICAgICAgICAgY29uc3Qgc3VjY2VlZGVkID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwoaW50ZXJ2YWwpO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGNvbnN0IGVycm9yZWQgPSAoZXJyKSA9PiB7XG4gICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XG4gICAgICAgICAgICAgICAgcmVqZWN0KGVycik7XG4gICAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICB9XG59XG4iXX0=
