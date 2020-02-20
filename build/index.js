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
const csv = require("csvtojson");
const TypeChecker_1 = require("./TypeChecker");
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
    executeQueryAsStream(sql, parameters, id) {
        return new Promise(async (resolve, reject) => {
            const s3 = new S3({
                accessKeyId: this._config.awsConfig.accessKeyId,
                secretAccessKey: this._config.awsConfig.secretAccessKey,
            });
            const s3Url = await this.executeQueryAndGetS3Url(sql, parameters, id);
            const s3Object = s3urls.fromUrl(s3Url);
            const stream = s3.getObject({
                Bucket: s3Object.Bucket,
                Key: s3Object.Key,
            }).createReadStream();
            const parsedResults = [];
            stream
                .pipe(csv({
                ignoreEmpty: true,
                trim: true,
            }).on('data', (row) => {
                const rowObj = JSON.parse(row.toString('utf8'));
                for (let [prop, value] of Object.entries(rowObj)) {
                    const parser = new TypeChecker_1.default(value);
                    rowObj[prop] = parser.parse();
                }
                parsedResults.push(rowObj);
            }).on('end', () => {
                resolve(parsedResults);
            }).on('error', (err) => {
                reject(err);
            }));
        });
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

//# sourceMappingURL=data:application/json;charset=utf8;base64,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LENBQUMsQ0FBQztZQUViLE1BQU0sU0FBUyxHQUFHLEdBQUcsRUFBRTtnQkFDbkIsYUFBYSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUN4QixPQUFPLEVBQUUsQ0FBQztZQUNkLENBQUMsQ0FBQztZQUVGLE1BQU0sT0FBTyxHQUFHLENBQUMsR0FBRyxFQUFFLEVBQUU7Z0JBQ3BCLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDeEIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ2hCLENBQUMsQ0FBQztRQUNOLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztDQUNKO0FBMWFELG9DQTBhQyIsImZpbGUiOiJpbmRleC5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7QXRoZW5hfSBmcm9tICdhd3Mtc2RrJztcbmltcG9ydCB7QXRoZW5hQ2xpZW50Q29uZmlnfSBmcm9tICcuL0F0aGVuYUNsaWVudENvbmZpZyc7XG5pbXBvcnQge1F1ZXVlfSBmcm9tICcuL1F1ZXVlJztcbmltcG9ydCB7UXVlcnl9IGZyb20gJy4vUXVlcnknO1xuaW1wb3J0IHtBdGhlbmFDbGllbnRFeGNlcHRpb259IGZyb20gJy4vZXhjZXB0aW9uL0F0aGVuYUNsaWVudEV4Y2VwdGlvbic7XG5pbXBvcnQge1F1ZXJ5Q2FuY2VsZWRFeGNlcHRpb259IGZyb20gJy4vZXhjZXB0aW9uL1F1ZXJ5Q2FuY2VsZWRFeGNlcHRpb24nO1xuaW1wb3J0IHtDb2x1bW59IGZyb20gJy4vQ29sdW1uJztcbmltcG9ydCAqIGFzIFMzIGZyb20gJ2F3cy1zZGsvY2xpZW50cy9zMyc7XG5pbXBvcnQge2NvbmZpZyBhcyBhd3NDb25maWd9IGZyb20gJ2F3cy1zZGsnO1xuaW1wb3J0ICogYXMgczN1cmxzIGZyb20gJ0BtYXBib3gvczN1cmxzJztcbmltcG9ydCAqIGFzIGNzdiBmcm9tICdjc3Z0b2pzb24nO1xuaW1wb3J0IFR5cGVDaGVja2VyIGZyb20gJy4vVHlwZUNoZWNrZXInO1xuXG5jb25zdCBleHBpcmF0aW9uMURheSA9IDYwICogNjAgKiAyNDtcblxuZW51bSBBdGhlbmFEYXRhVHlwZUVudW0ge1xuICAgIEludGVnZXIgPSAnaW50ZWdlcicsXG4gICAgRmxvYXQgPSAnZmxvYXQnLFxuICAgIERvdWJsZSA9ICdkb3VibGUnLFxuICAgIERlY2ltYWwgPSAnZGVjaW1hbCcsXG4gICAgQ2hhciA9ICdjaGFyJyxcbiAgICBWYXJjaGFyID0gJ3ZhcmNoYXInLFxuICAgIEJvb2xlYW4gPSAnYm9vbGVhbicsXG4gICAgQmluYXJ5ID0gJ2JpbmFyeScsXG4gICAgRGF0ZSA9ICdkYXRlJyxcbiAgICBUaW1lc3RhbXAgPSAndGltZXN0YW1wJyxcbiAgICBUaW1lc3RhbXBXaXRoVHogPSAndGltZXN0YW1wIHdpdGggdGltZSB6b25lJyxcbiAgICBBcnJheSA9ICdhcnJheScsXG4gICAgSnNvbiA9ICdqc29uJyxcbiAgICBNYXAgPSAnbWFwJyxcbiAgICBTdHJpbmcgPSAnc3RyaW5nJyxcbiAgICBTdHJ1Y3QgPSAnc3RydWN0JyxcbiAgICBUaW55SW50ID0gJ3RpbnlpbnQnLFxuICAgIFNtYWxsSW50ID0gJ3NtYWxsaW50JyxcbiAgICBCaWdJbnQgPSAnYmlnaW50Jyxcbn1cblxuLyoqXG4gKiBBdGhlbmFDbGllbnQgY2xhc3NcbiAqXG4gKiBAZXhwb3J0XG4gKiBAY2xhc3MgQXRoZW5hQ2xpZW50XG4gKi9cbmV4cG9ydCBjbGFzcyBBdGhlbmFDbGllbnQge1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX2NsaWVudDogQXRoZW5hO1xuICAgIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZzogQXRoZW5hQ2xpZW50Q29uZmlnO1xuXG4gICAgcHJpdmF0ZSBfcXVldWU6IFF1ZXVlO1xuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhbiBpbnN0YW5jZSBvZiBBdGhlbmFDbGllbnQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0F0aGVuYUNsaWVudENvbmZpZ30gY29uZmlnIC0gQ29uZmlnIGZvciBBV1MgQXRoZW5hXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNsaWVudFxuICAgICAqL1xuICAgIHB1YmxpYyBjb25zdHJ1Y3Rvcihjb25maWc6IEF0aGVuYUNsaWVudENvbmZpZykge1xuICAgICAgICB0aGlzLl9jb25maWcgPSBjb25maWc7XG4gICAgICAgIHRoaXMuX2NvbmZpZy5hd3NDb25maWcuYXBpVmVyc2lvbiA9ICcyMDE3LTA1LTE4JztcblxuICAgICAgICB0aGlzLl9jbGllbnQgPSBuZXcgQXRoZW5hKHRoaXMuX2NvbmZpZy5hd3NDb25maWcpO1xuICAgICAgICB0aGlzLl9xdWV1ZSA9IG5ldyBRdWV1ZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgcXVlcnkgaW4gQXRoZW5hXG4gICAgICpcbiAgICAgKiBAdGVtcGxhdGUgVFxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHNxbCAtIHF1ZXJ5IHRvIGV4ZWN1dGUsIGFzIHN0cmluZ1xuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBwYXJhbWV0ZXJzIC0gcGFyYW1ldGVycyBmb3IgcXVlcnlcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gaWQgLSBZb3VyIGN1c3RvbSBJRFxuICAgICAqXG4gICAgICogQHJldHVybnMge1Byb21pc2U8VFtdPn0gLSBwYXJzZWQgcXVlcnkgcmVzdWx0c1xuICAgICAqXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNsaWVudFxuICAgICAqL1xuICAgIHB1YmxpYyBhc3luYyBleGVjdXRlUXVlcnk8VD4oc3FsOiBzdHJpbmcsIHBhcmFtZXRlcnM/OiBPYmplY3QsIGlkPzogc3RyaW5nKTogUHJvbWlzZTxUW10+IHtcbiAgICAgICAgY29uc3QgcXVlcnkgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeUNvbW1vbihzcWwsIHBhcmFtZXRlcnMsIGlkKTtcblxuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5nZXRRdWVyeVJlc3VsdHMocXVlcnkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGUgcXVlcnkgaW4gQXRoZW5hIGFuZCBnZXQgUzMgVVJMIHdpdGggQ1NWIGZpbGVcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBzcWwgLSBxdWVyeSB0byBleGVjdXRlLCBhcyBzdHJpbmdcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gcGFyYW1ldGVycyAtIHBhcmFtZXRlcnMgZm9yIHF1ZXJ5XG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGlkIC0gWW91ciBjdXN0b20gSURcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPHN0cmluZz59IC0gUzMgVVJMXG4gICAgICpcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHVibGljIGFzeW5jIGV4ZWN1dGVRdWVyeUFuZEdldFMzVXJsKHNxbDogc3RyaW5nLCBwYXJhbWV0ZXJzPzogT2JqZWN0LCBpZD86IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnlDb21tb24oc3FsLCBwYXJhbWV0ZXJzLCBpZCk7XG4gICAgICAgIGNvbnN0IHMzQnVja2V0VXJpID0gYXdhaXQgdGhpcy5nZXRPdXRwdXRTM0J1Y2tldCgpO1xuXG4gICAgICAgIHJldHVybiBgJHtzM0J1Y2tldFVyaX0ke3F1ZXJ5LmF0aGVuYUlkfS5jc3ZgO1xuICAgIH1cblxuICAgIHB1YmxpYyBleGVjdXRlUXVlcnlBc1N0cmVhbShzcWw6IHN0cmluZywgcGFyYW1ldGVycz86IE9iamVjdCwgaWQ/OiBzdHJpbmcpOiBQcm9taXNlPGFueVtdPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShhc3luYyAocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBzMyA9IG5ldyBTMyh7XG4gICAgICAgICAgICAgICAgYWNjZXNzS2V5SWQ6IHRoaXMuX2NvbmZpZy5hd3NDb25maWcuYWNjZXNzS2V5SWQsXG4gICAgICAgICAgICAgICAgc2VjcmV0QWNjZXNzS2V5OiB0aGlzLl9jb25maWcuYXdzQ29uZmlnLnNlY3JldEFjY2Vzc0tleSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgY29uc3QgczNVcmwgPSBhd2FpdCB0aGlzLmV4ZWN1dGVRdWVyeUFuZEdldFMzVXJsKHNxbCwgcGFyYW1ldGVycywgaWQpO1xuICAgICAgICAgICAgY29uc3QgczNPYmplY3QgPSBzM3VybHMuZnJvbVVybChzM1VybCk7XG4gICAgICAgICAgICBjb25zdCBzdHJlYW0gPSBzMy5nZXRPYmplY3Qoe1xuICAgICAgICAgICAgICAgIEJ1Y2tldDogczNPYmplY3QuQnVja2V0LFxuICAgICAgICAgICAgICAgIEtleTogczNPYmplY3QuS2V5LFxuICAgICAgICAgICAgfSkuY3JlYXRlUmVhZFN0cmVhbSgpO1xuICAgICAgICAgICAgY29uc3QgcGFyc2VkUmVzdWx0cyA9IFtdO1xuICAgICAgICAgICAgc3RyZWFtXG4gICAgICAgICAgICAgICAgLnBpcGUoXG4gICAgICAgICAgICAgICAgICAgIGNzdih7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZ25vcmVFbXB0eTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyaW06IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIH0pLm9uKCdkYXRhJywgKHJvdykgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgcm93T2JqID0gSlNPTi5wYXJzZShyb3cudG9TdHJpbmcoJ3V0ZjgnKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBbcHJvcCwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHJvd09iaikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXJzZXIgPSBuZXcgVHlwZUNoZWNrZXIodmFsdWUgYXMgc3RyaW5nKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByb3dPYmpbcHJvcF0gPSBwYXJzZXIucGFyc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcnNlZFJlc3VsdHMucHVzaChyb3dPYmopO1xuICAgICAgICAgICAgICAgICAgICB9KS5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShwYXJzZWRSZXN1bHRzKTtcbiAgICAgICAgICAgICAgICAgICAgfSkub24oJ2Vycm9yJywgKGVycikgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHB1YmxpYyBhc3luYyBleGVjdXRlUXVlcnlBbmRHZXREb3dubG9hZFNpZ25lZFVybChzcWw6IHN0cmluZywgcGFyYW1ldGVycz86IE9iamVjdCwgaWQ/OiBzdHJpbmcsIGV4cGlyYXRpb24gPSBleHBpcmF0aW9uMURheSk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgICAgIGNvbnN0IHMzVXJsID0gYXdhaXQgdGhpcy5leGVjdXRlUXVlcnlBbmRHZXRTM1VybChzcWwsIHBhcmFtZXRlcnMsIGlkKTtcbiAgICAgICAgY29uc3QgczNPYmplY3QgPSBzM3VybHMuZnJvbVVybChzM1VybCk7XG5cbiAgICAgICAgY29uc3QgczMgPSBuZXcgUzMoKTtcbiAgICAgICAgYXdzQ29uZmlnLnVwZGF0ZSh7XG4gICAgICAgICAgICBhY2Nlc3NLZXlJZDogdGhpcy5fY29uZmlnLmF3c0NvbmZpZy5hY2Nlc3NLZXlJZCxcbiAgICAgICAgICAgIHNlY3JldEFjY2Vzc0tleTogdGhpcy5fY29uZmlnLmF3c0NvbmZpZy5zZWNyZXRBY2Nlc3NLZXksXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBzMy5nZXRTaWduZWRVcmwoJ2dldE9iamVjdCcsIHtcbiAgICAgICAgICAgIEJ1Y2tldDogczNPYmplY3QuQnVja2V0LFxuICAgICAgICAgICAgRXhwaXJlczogZXhwaXJhdGlvbixcbiAgICAgICAgICAgIEtleTogczNPYmplY3QuS2V5LFxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDYW5jZWwgYSBBV1MgQXRoZW5hIHF1ZXJ5XG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gaWQgWW91ciBjdXN0b20gSURcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fVxuICAgICAqXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNsaWVudFxuICAgICAqL1xuICAgIHB1YmxpYyBhc3luYyBjYW5jZWxRdWVyeShpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5fcXVldWUuZ2V0UXVlcnlCeUlkKGlkKTtcbiAgICAgICAgY29uc3QgcmVxdWVzdFBhcmFtczogQXRoZW5hLlR5cGVzLlN0b3BRdWVyeUV4ZWN1dGlvbklucHV0ID0ge1xuICAgICAgICAgICAgUXVlcnlFeGVjdXRpb25JZDogcXVlcnkuYXRoZW5hSWQsXG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRoaXMuX2NsaWVudC5zdG9wUXVlcnlFeGVjdXRpb24ocmVxdWVzdFBhcmFtcywgKGVyciwgZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCBXb3JrR3JvdXAgZGV0YWlsc1xuICAgICAqXG4gICAgICogQHJldHVybnMge1Byb21pc2U8QXRoZW5hLldvcmtHcm91cD59IEFXUyBXb3JrR3JvdXAgT2JqZWN0XG4gICAgICovXG4gICAgcHVibGljIGFzeW5jIGdldFdvcmtHcm91cERldGFpbHMoKTogUHJvbWlzZTxBdGhlbmEuV29ya0dyb3VwPiB7XG4gICAgICAgIGlmICh0aGlzLl9jb25maWcud29ya0dyb3VwID09IG51bGwgfHwgdGhpcy5fY29uZmlnLndvcmtHcm91cCA9PT0gJycpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignWW91IG11c3QgZGVmaW5lIGFuIEFXUyBBdGhlbmEgV29ya0dyb3VwJyk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwYXJhbWV0ZXJzOiBBdGhlbmEuR2V0V29ya0dyb3VwSW5wdXQgPSB7XG4gICAgICAgICAgICBXb3JrR3JvdXA6IHRoaXMuX2NvbmZpZy53b3JrR3JvdXAsXG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPEF0aGVuYS5Xb3JrR3JvdXA+KChyZXNvbHZlOiBGdW5jdGlvbiwgcmVqZWN0OiBGdW5jdGlvbikgPT4ge1xuICAgICAgICAgICAgdGhpcy5fY2xpZW50LmdldFdvcmtHcm91cChwYXJhbWV0ZXJzLCAoKGVycjogRXJyb3IsIGRhdGE6IEF0aGVuYS5HZXRXb3JrR3JvdXBPdXRwdXQpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKGRhdGEuV29ya0dyb3VwKTtcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IG91dHB1dCBTMyBidWNrZXQgZnJvbSBidWNrZXRVcmkgY29uZmlnIHBhcmFtZXRlciBvciBmcm9tIFdvcmtHcm91cFxuICAgICAqXG4gICAgICogQHJldHVybnMge1Byb21pc2U8c3RyaW5nPn0gUzMgQnVja2V0IFVSSVxuICAgICAqL1xuICAgIHB1YmxpYyBhc3luYyBnZXRPdXRwdXRTM0J1Y2tldCgpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgICAgICBsZXQgYnVja2V0OiBzdHJpbmc7XG5cbiAgICAgICAgaWYgKHRoaXMuX2NvbmZpZy5idWNrZXRVcmkgIT0gbnVsbCAmJiB0aGlzLl9jb25maWcuYnVja2V0VXJpICE9PSAnJykge1xuICAgICAgICAgICAgYnVja2V0ID0gdGhpcy5fY29uZmlnLmJ1Y2tldFVyaTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLl9jb25maWcud29ya0dyb3VwICE9IG51bGwgfHwgdGhpcy5fY29uZmlnLndvcmtHcm91cCAhPT0gJycpIHtcbiAgICAgICAgICAgIGNvbnN0IHdvcmtHcm91cCA9IGF3YWl0IHRoaXMuZ2V0V29ya0dyb3VwRGV0YWlscygpO1xuXG4gICAgICAgICAgICBidWNrZXQgPSB3b3JrR3JvdXAuQ29uZmlndXJhdGlvbi5SZXN1bHRDb25maWd1cmF0aW9uLk91dHB1dExvY2F0aW9uO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdZb3UgbXVzdCBkZWZpbmUgYSBTMyBCdWNrZXQgVVJJIGFuZC9vciBhIFdvcmtHcm91cCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGJ1Y2tldDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGFzeW5jIGV4ZWN1dGVRdWVyeUNvbW1vbihzcWw6IHN0cmluZywgcGFyYW1ldGVycz86IE9iamVjdCwgaWQ/OiBzdHJpbmcpOiBQcm9taXNlPFF1ZXJ5PiB7XG4gICAgICAgIGNvbnN0IHF1ZXJ5ID0gbmV3IFF1ZXJ5KHNxbCwgcGFyYW1ldGVycywgaWQpO1xuXG4gICAgICAgIHRoaXMuX3F1ZXVlLmFkZFF1ZXJ5KHF1ZXJ5KTtcblxuICAgICAgICBxdWVyeS5hdGhlbmFJZCA9IGF3YWl0IHRoaXMuc3RhcnRRdWVyeUV4ZWN1dGlvbihxdWVyeSk7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMud2FpdFVudGlsU3VjY2VlZFF1ZXJ5KHF1ZXJ5KTtcbiAgICAgICAgfSBjYXRjaCAoZXhjZXB0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLl9xdWV1ZS5yZW1vdmVRdWVyeShxdWVyeSk7XG5cbiAgICAgICAgICAgIHRocm93IGV4Y2VwdGlvbjtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdGFydHMgcXVlcnkgZXhlY3V0aW9uIGFuZCBnZXRzIGFuIElEIGZvciB0aGUgb3BlcmF0aW9uXG4gICAgICpcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqIEBwYXJhbSB7UXVlcnl9IHF1ZXJ5IC0gQXRoZW5hIHJlcXVlc3QgcGFyYW1zXG4gICAgICogQHJldHVybnMge1Byb21pc2U8c3RyaW5nPn0gLSBxdWVyeSBleGVjdXRpb24gaWRcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHJpdmF0ZSBhc3luYyBzdGFydFF1ZXJ5RXhlY3V0aW9uKHF1ZXJ5OiBRdWVyeSk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgICAgIGNvbnN0IHJlcXVlc3RQYXJhbXM6IEF0aGVuYS5UeXBlcy5TdGFydFF1ZXJ5RXhlY3V0aW9uSW5wdXQgPSB7XG4gICAgICAgICAgICBRdWVyeUV4ZWN1dGlvbkNvbnRleHQ6IHtcbiAgICAgICAgICAgICAgICBEYXRhYmFzZTogdGhpcy5fY29uZmlnLmRhdGFiYXNlLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFF1ZXJ5U3RyaW5nOiBxdWVyeS5zcWwsXG4gICAgICAgICAgICBSZXN1bHRDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgICAgICAgT3V0cHV0TG9jYXRpb246IHRoaXMuX2NvbmZpZy5idWNrZXRVcmksXG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuXG4gICAgICAgIGlmICh0aGlzLl9jb25maWcud29ya0dyb3VwICE9IG51bGwpIHtcbiAgICAgICAgICAgIHJlcXVlc3RQYXJhbXMuV29ya0dyb3VwID0gdGhpcy5fY29uZmlnLndvcmtHcm91cDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTxzdHJpbmc+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRoaXMuX2NsaWVudC5zdGFydFF1ZXJ5RXhlY3V0aW9uKHJlcXVlc3RQYXJhbXMsIChlcnIsIGRhdGEpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKGRhdGEuUXVlcnlFeGVjdXRpb25JZCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUHJvY2Vzc2VzIHF1ZXJ5IHJlc3VsdHMgYW5kIHBhcnNlcyB0aGVtXG4gICAgICpcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqIEB0ZW1wbGF0ZSBUXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1F1ZXJ5PFQ+fSBxdWVyeVxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBuZXh0VG9rZW5cbiAgICAgKiBAcGFyYW0ge1RbXX0gcHJldmlvdXNSZXN1bHRzXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTxUW10+fSAtIHBhcnNlZCBxdWVyeSByZXN1bHQgcm93c1xuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDbGllbnRcbiAgICAgKi9cbiAgICBwcml2YXRlIGdldFF1ZXJ5UmVzdWx0czxUPihxdWVyeTogUXVlcnk8VD4sIG5leHRUb2tlbj86IHN0cmluZywgcHJldmlvdXNSZXN1bHRzPzogVFtdKTogUHJvbWlzZTxUW10+IHtcbiAgICAgICAgY29uc3QgcmVxdWVzdFBhcmFtczogQXRoZW5hLlR5cGVzLkdldFF1ZXJ5UmVzdWx0c0lucHV0ID0ge1xuICAgICAgICAgICAgTmV4dFRva2VuOiBuZXh0VG9rZW4sXG4gICAgICAgICAgICBRdWVyeUV4ZWN1dGlvbklkOiBxdWVyeS5hdGhlbmFJZCxcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8VFtdPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICB0aGlzLl9jbGllbnQuZ2V0UXVlcnlSZXN1bHRzKHJlcXVlc3RQYXJhbXMsIGFzeW5jIChlcnIsIGRhdGEpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICghcXVlcnkuaGFzQ29sdW1ucygpKSB7XG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LmNvbHVtbnMgPSB0aGlzLnNldENvbHVtblBhcnNlcnMoZGF0YSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29uc3QgaXNGaXJzdFBhZ2UgPSAhcXVlcnkuaGFzUmVzdWx0cygpICYmIG5leHRUb2tlbiA9PSBudWxsO1xuXG4gICAgICAgICAgICAgICAgcXVlcnkucmVzdWx0cy5wdXNoKC4uLnRoaXMucGFyc2VSb3dzPFQ+KGRhdGEuUmVzdWx0U2V0LlJvd3MsIHF1ZXJ5LmNvbHVtbnMsIGlzRmlyc3RQYWdlKSk7XG5cbiAgICAgICAgICAgICAgICBpZiAoZGF0YS5OZXh0VG9rZW4gIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICBxdWVyeS5yZXN1bHRzID0gYXdhaXQgdGhpcy5nZXRRdWVyeVJlc3VsdHM8VD4ocXVlcnksIGRhdGEuTmV4dFRva2VuKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXNvbHZlKHF1ZXJ5LnJlc3VsdHMpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBhcnNlcyByZXN1bHQgcm93c1xuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAdGVtcGxhdGUgVFxuICAgICAqIEBwYXJhbSB7QXRoZW5hLlJvd1tdfSByb3dzIC0gcXVlcnkgcmVzdWx0IHJvd3NcbiAgICAgKiBAcGFyYW0ge0NvbHVtbltdfSBjb2x1bW5zIC0gcXVlcnkgcmVzdWx0IGNvbHVtbnNcbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IGlzRmlyc3RQYWdlXG4gICAgICogQHJldHVybnMge1RbXX0gLSBwYXJzZWQgcmVzdWx0IGFjY29yZGluZyB0byBuZWVkZWQgcGFyc2VyXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNsaWVudFxuICAgICAqL1xuICAgIHByaXZhdGUgcGFyc2VSb3dzPFQ+KHJvd3M6IEF0aGVuYS5Sb3dbXSwgY29sdW1uczogQ29sdW1uW10sIGlzRmlyc3RQYWdlID0gZmFsc2UpOiBUW10ge1xuICAgICAgICBjb25zdCByZXN1bHRzOiBUW10gPSBbXTtcblxuICAgICAgICAvLyBTdGFydCB3aXRoIDEgd2hlbiBmaXJzdCBsaW5lIGlzIGNvbHVtbiB0aXRsZSAoaW4gZmlyc3QgcGFnZSlcbiAgICAgICAgZm9yIChsZXQgcm93SW5kZXggPSAoaXNGaXJzdFBhZ2UpID8gMSA6IDAsIGxlbiA9IHJvd3MubGVuZ3RoOyByb3dJbmRleCA8IGxlbjsgcm93SW5kZXgrKykge1xuICAgICAgICAgICAgY29uc3Qgcm93ID0gcm93c1tyb3dJbmRleF07XG4gICAgICAgICAgICBjb25zdCByZXN1bHQ6IFQgPSB7fSBhcyBUO1xuXG4gICAgICAgICAgICBmb3IgKGxldCByb3dEYXRhSW5kZXggPSAwOyByb3dEYXRhSW5kZXggPCByb3cuRGF0YS5sZW5ndGg7IHJvd0RhdGFJbmRleCsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgcm93RGF0YSA9IHJvdy5EYXRhW3Jvd0RhdGFJbmRleF07XG4gICAgICAgICAgICAgICAgY29uc3QgY29sdW1uID0gY29sdW1uc1tyb3dEYXRhSW5kZXhdO1xuXG4gICAgICAgICAgICAgICAgaWYgKHJvd0RhdGE/LlZhckNoYXJWYWx1ZSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdFtjb2x1bW4ubmFtZV0gPSBjb2x1bW4ucGFyc2Uocm93RGF0YS5WYXJDaGFyVmFsdWUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdFtjb2x1bW4ubmFtZV0gPSBudWxsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVzdWx0cy5wdXNoKHJlc3VsdCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXQgYXBwcm9wcmlhdGUgY29sdW1uIHBhcnNlcnMgYWNjb3JkaW5nIHRvIGNvbHVtbnMnIGRhdGEgdHlwZVxuICAgICAqXG4gICAgICogQHByaXZhdGVcbiAgICAgKiBAcGFyYW0geyp9IGRhdGEgLSBxdWVyeSByZXN1bHRzXG4gICAgICogQHJldHVybnMge0NvbHVtbltdfSAtIGNvbHVtbiBuYW1lIGFuZCBwYXJzZXIgdHlwZVxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDbGllbnRcbiAgICAgKi9cbiAgICBwcml2YXRlIHNldENvbHVtblBhcnNlcnMoZGF0YSk6IENvbHVtbltdIHtcbiAgICAgICAgY29uc3QgY29sdW1uczogQ29sdW1uW10gPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IGNvbHVtbkluZm8gb2YgZGF0YS5SZXN1bHRTZXQuUmVzdWx0U2V0TWV0YWRhdGEuQ29sdW1uSW5mbykge1xuICAgICAgICAgICAgY29uc3QgY29sdW1uID0gbmV3IENvbHVtbigpO1xuICAgICAgICAgICAgY29sdW1uLm5hbWUgPSBjb2x1bW5JbmZvLk5hbWU7XG5cbiAgICAgICAgICAgIHN3aXRjaCAoY29sdW1uSW5mby5UeXBlIGFzIEF0aGVuYURhdGFUeXBlRW51bSkge1xuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkludGVnZXI6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uVGlueUludDpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5TbWFsbEludDpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5CaWdJbnQ6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uRmxvYXQ6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uRG91YmxlOlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkRlY2ltYWw6XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbi5wYXJzZSA9IENvbHVtbi5wYXJzZU51bWJlcjtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5DaGFyOlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLlZhcmNoYXI6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uU3RyaW5nOlxuICAgICAgICAgICAgICAgICAgICBjb2x1bW4ucGFyc2UgPSBDb2x1bW4ucGFyc2VTdHJpbmc7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uQm9vbGVhbjpcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uLnBhcnNlID0gQ29sdW1uLnBhcnNlQm9vbGVhbjtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5EYXRlOlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLlRpbWVzdGFtcDpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5UaW1lc3RhbXBXaXRoVHo6XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbi5wYXJzZSA9IENvbHVtbi5wYXJzZURhdGU7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uQXJyYXk6XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbi5wYXJzZSA9IENvbHVtbi5wYXJzZUFycmF5O1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5Kc29uOlxuICAgICAgICAgICAgICAgICAgICBjb2x1bW4ucGFyc2UgPSBDb2x1bW4ucGFyc2VKc29uO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5CaW5hcnk6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uTWFwOlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLlN0cnVjdDpcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENvbHVtbiB0eXBlICcke2NvbHVtbkluZm8uVHlwZX0nIG5vdCBzdXBwb3J0ZWRgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29sdW1ucy5wdXNoKGNvbHVtbik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gY29sdW1ucztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDaGVja3MgdGhlIHF1ZXJ5IGV4ZWN1dGlvbiBzdGF0dXMgdW50aWwgdGhlIHF1ZXJ5IHNlbmRzIFNVQ0NFRURFRCBzaWduYWxcbiAgICAgKlxuICAgICAqIEBwcml2YXRlXG4gICAgICogQHBhcmFtIHtRdWVyeX0gcXVlcnkgLSB0aGUgcXVlcnlcbiAgICAgKiBAcmV0dXJucyB7UHJvbWlzZTx2b2lkPn0gLSBwcm9taXNlIHRoYXQgd2lsbCByZXNvbHZlIG9uY2UgdGhlIG9wZXJhdGlvbiBoYXMgZmluaXNoZWRcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ2xpZW50XG4gICAgICovXG4gICAgcHJpdmF0ZSBhc3luYyB3YWl0VW50aWxTdWNjZWVkUXVlcnkocXVlcnk6IFF1ZXJ5KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IHJlcXVlc3RQYXJhbXM6IEF0aGVuYS5UeXBlcy5HZXRRdWVyeUV4ZWN1dGlvbklucHV0ID0ge1xuICAgICAgICAgICAgUXVlcnlFeGVjdXRpb25JZDogcXVlcnkuYXRoZW5hSWQsXG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3Qgd2FpdFRpbWUgPSB0aGlzLl9jb25maWcud2FpdFRpbWUgKiAxMDAwO1xuXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBpbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLl9jbGllbnQuZ2V0UXVlcnlFeGVjdXRpb24ocmVxdWVzdFBhcmFtcywgKGVyciwgZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXJyICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LnN0YXR1cyA9IGRhdGEuUXVlcnlFeGVjdXRpb24uU3RhdHVzLlN0YXRlO1xuXG4gICAgICAgICAgICAgICAgICAgIHN3aXRjaCAocXVlcnkuc3RhdHVzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdTVUNDRUVERUQnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2NlZWRlZCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnUVVFVUVEJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ1JVTk5JTkcnOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnQ0FOQ0VMTEVEJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcmVkKG5ldyBRdWVyeUNhbmNlbGVkRXhjZXB0aW9uKCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnRkFJTEVEJzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcmVkKG5ldyBBdGhlbmFDbGllbnRFeGNlcHRpb24oJ1F1ZXJ5IGZhaWxlZCcpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3JlZChuZXcgQXRoZW5hQ2xpZW50RXhjZXB0aW9uKGBRdWVyeSBTdGF0dXMgJyR7ZGF0YS5RdWVyeUV4ZWN1dGlvbi5TdGF0dXMuU3RhdGV9JyBub3Qgc3VwcG9ydGVkYCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9LCB3YWl0VGltZSk7XG5cbiAgICAgICAgICAgIGNvbnN0IHN1Y2NlZWRlZCA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKGludGVydmFsKTtcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBlcnJvcmVkID0gKGVycikgPT4ge1xuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwoaW50ZXJ2YWwpO1xuICAgICAgICAgICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgfVxufVxuIl19
