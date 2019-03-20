'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const aws_sdk_1 = require("aws-sdk");
const formatting_1 = require("pg-promise/lib/formatting");
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
class AthenaClient {
    constructor(config) {
        this.config = config;
        this.config.awsConfig.apiVersion = '2017-05-18';
        this.client = new aws_sdk_1.Athena(this.config.awsConfig);
    }
    executeQuery(query, parameters) {
        return __awaiter(this, void 0, void 0, function* () {
            query = formatting_1.formatQuery(query, parameters);
            const requestParams = {
                QueryExecutionContext: {
                    Database: this.config.database,
                },
                QueryString: query,
                ResultConfiguration: {
                    OutputLocation: this.config.bucketUri,
                },
            };
            if (this.config.workGroup != null) {
                requestParams.WorkGroup = this.config.workGroup;
            }
            const queryExecutionId = yield this.startQueryExecution(requestParams);
            yield this.waitUntilSucceedQuery(queryExecutionId);
            return yield this.getQueryResults(queryExecutionId);
        });
    }
    startQueryExecution(requestParams) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.client.startQueryExecution(requestParams, (err, data) => {
                    if (err != null) {
                        return reject(err);
                    }
                    return resolve(data.QueryExecutionId);
                });
            });
        });
    }
    getQueryResults(queryExecutionId) {
        const requestParams = {
            QueryExecutionId: queryExecutionId,
        };
        let columns;
        return new Promise(((resolve, reject) => {
            this.client.getQueryResults(requestParams, ((err, data) => {
                if (err != null) {
                    return reject(err);
                }
                columns = this.setColumnParsers(data);
                const results = this.parseRows(data.ResultSet.Rows, columns);
                resolve(results);
            }));
        }));
    }
    parseRows(rows, columns) {
        const results = [];
        for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
            const row = rows[rowIndex];
            const result = {};
            for (let rowDataIndex = 0; rowDataIndex < row.Data.length; rowDataIndex++) {
                const rowData = row.Data[rowDataIndex];
                const column = columns[rowDataIndex];
                result[column.name] = column.parse(rowData.VarCharValue);
            }
            results.push(result);
        }
        return results;
    }
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
                case AthenaDataTypeEnum.Json:
                    column.parse = AthenaColumn.parseArray;
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
    waitUntilSucceedQuery(queryExecutionId) {
        return __awaiter(this, void 0, void 0, function* () {
            const requestParams = {
                QueryExecutionId: queryExecutionId,
            };
            return new Promise((resolve, reject) => {
                this.client.getQueryExecution(requestParams, ((err, data) => __awaiter(this, void 0, void 0, function* () {
                    if (err != null) {
                        return reject(err);
                    }
                    switch (data.QueryExecution.Status.State) {
                        case 'SUCCEEDED':
                            resolve();
                            break;
                        case 'QUEUED':
                        case 'RUNNING':
                            setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                                yield this.waitUntilSucceedQuery(queryExecutionId);
                                resolve();
                            }), this.config.waitTime * 1000);
                            break;
                        case 'CANCELLED':
                            reject(new Error(`Query cancelled`));
                            break;
                        case 'FAILED':
                            reject(new Error(`Query failed`));
                            break;
                        default:
                            reject(new Error(`Query Status '${data.QueryExecution.Status.State}' not supported`));
                            break;
                    }
                })));
            });
        });
    }
}
exports.AthenaClient = AthenaClient;
class AthenaColumn {
    static parseNumber(value) {
        const result = Number(value);
        if (isNaN(result)) {
            throw new Error(`The value '${value} 'is not a number`);
        }
        return result;
    }
    static parseString(value) {
        return value;
    }
    static parseBoolean(value) {
        return (value === 'true'
            || value === 'TRUE'
            || value === 't'
            || value === 'T'
            || value === 'yes'
            || value === 'YES'
            || value === '1');
    }
    static parseDate(value) {
        return new Date(value);
    }
    static parseArray(value) {
        return JSON.parse(value);
    }
}

//# sourceMappingURL=data:application/json;charset=utf8;base64,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QUssS0FBSyxHQUFHO2VBQ2IsS0FBSyxLQUFLLEtBQUs7ZUFDZixLQUFLLEtBQUssS0FBSztlQUNmLEtBQUssS0FBSyxHQUFHLENBQ25CLENBQUM7SUFDTixDQUFDO0lBRU0sTUFBTSxDQUFDLFNBQVMsQ0FBQyxLQUFhO1FBQ2pDLE9BQU8sSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDM0IsQ0FBQztJQUVNLE1BQU0sQ0FBQyxVQUFVLENBQUMsS0FBYTtRQUNsQyxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDN0IsQ0FBQztDQUNKIiwiZmlsZSI6ImluZGV4LmpzIiwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnO1xuXG5pbXBvcnQge0F0aGVuYX0gZnJvbSAnYXdzLXNkayc7XG5pbXBvcnQge2Zvcm1hdFF1ZXJ5fSBmcm9tICdwZy1wcm9taXNlL2xpYi9mb3JtYXR0aW5nJztcbmltcG9ydCB7QXRoZW5hQ2xpZW50Q29uZmlnfSBmcm9tICcuL0F0aGVuYUNsaWVudENvbmZpZyc7XG5cbmVudW0gQXRoZW5hRGF0YVR5cGVFbnVtIHtcbiAgICBJbnRlZ2VyID0gJ2ludGVnZXInLFxuICAgIEZsb2F0ID0gJ2Zsb2F0JyxcbiAgICBEb3VibGUgPSAnZG91YmxlJyxcbiAgICBEZWNpbWFsID0gJ2RlY2ltYWwnLFxuICAgIENoYXIgPSAnY2hhcicsXG4gICAgVmFyY2hhciA9ICd2YXJjaGFyJyxcbiAgICBCb29sZWFuID0gJ2Jvb2xlYW4nLFxuICAgIEJpbmFyeSA9ICdiaW5hcnknLFxuICAgIERhdGUgPSAnZGF0ZScsXG4gICAgVGltZXN0YW1wID0gJ3RpbWVzdGFtcCcsXG4gICAgVGltZXN0YW1wV2l0aFR6ID0gJ3RpbWVzdGFtcCB3aXRoIHRpbWUgem9uZScsXG4gICAgQXJyYXkgPSAnYXJyYXknLFxuICAgIEpzb24gPSAnanNvbicsXG4gICAgTWFwID0gJ21hcCcsXG4gICAgU3RydWN0ID0gJ3N0cnVjdCcsXG4gICAgVGlueUludCA9ICd0aW55aW50JyxcbiAgICBTbWFsbEludCA9ICdzbWFsbGludCcsXG4gICAgQmlnSW50ID0gJ2JpZ2ludCcsXG59XG5cbmV4cG9ydCBjbGFzcyBBdGhlbmFDbGllbnQge1xuICAgIHByaXZhdGUgcmVhZG9ubHkgY2xpZW50OiBBdGhlbmE7XG4gICAgcHJpdmF0ZSByZWFkb25seSBjb25maWc6IEF0aGVuYUNsaWVudENvbmZpZztcblxuICAgIHB1YmxpYyBjb25zdHJ1Y3Rvcihjb25maWc6IEF0aGVuYUNsaWVudENvbmZpZykge1xuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgICAgICAgdGhpcy5jb25maWcuYXdzQ29uZmlnLmFwaVZlcnNpb24gPSAnMjAxNy0wNS0xOCc7XG5cbiAgICAgICAgdGhpcy5jbGllbnQgPSBuZXcgQXRoZW5hKHRoaXMuY29uZmlnLmF3c0NvbmZpZyk7XG4gICAgfVxuXG4gICAgcHVibGljIGFzeW5jIGV4ZWN1dGVRdWVyeTxUPihxdWVyeTogc3RyaW5nLCBwYXJhbWV0ZXJzOiBPYmplY3QpOiBQcm9taXNlPFRbXT4ge1xuICAgICAgICBxdWVyeSA9IGZvcm1hdFF1ZXJ5KHF1ZXJ5LCBwYXJhbWV0ZXJzKTtcblxuICAgICAgICBjb25zdCByZXF1ZXN0UGFyYW1zOiBBdGhlbmEuVHlwZXMuU3RhcnRRdWVyeUV4ZWN1dGlvbklucHV0ID0ge1xuICAgICAgICAgICAgUXVlcnlFeGVjdXRpb25Db250ZXh0OiB7XG4gICAgICAgICAgICAgICAgRGF0YWJhc2U6IHRoaXMuY29uZmlnLmRhdGFiYXNlLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFF1ZXJ5U3RyaW5nOiBxdWVyeSxcbiAgICAgICAgICAgIFJlc3VsdENvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICAgICAgICBPdXRwdXRMb2NhdGlvbjogdGhpcy5jb25maWcuYnVja2V0VXJpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAodGhpcy5jb25maWcud29ya0dyb3VwICE9IG51bGwpIHtcbiAgICAgICAgICAgIHJlcXVlc3RQYXJhbXMuV29ya0dyb3VwID0gdGhpcy5jb25maWcud29ya0dyb3VwO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcXVlcnlFeGVjdXRpb25JZCA9IGF3YWl0IHRoaXMuc3RhcnRRdWVyeUV4ZWN1dGlvbihyZXF1ZXN0UGFyYW1zKTtcbiAgICAgICAgYXdhaXQgdGhpcy53YWl0VW50aWxTdWNjZWVkUXVlcnkocXVlcnlFeGVjdXRpb25JZCk7XG5cbiAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZ2V0UXVlcnlSZXN1bHRzKHF1ZXJ5RXhlY3V0aW9uSWQpO1xuICAgIH1cblxuICAgIHByaXZhdGUgYXN5bmMgc3RhcnRRdWVyeUV4ZWN1dGlvbihyZXF1ZXN0UGFyYW1zOiBBdGhlbmEuVHlwZXMuU3RhcnRRdWVyeUV4ZWN1dGlvbklucHV0KTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHN0cmluZz4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5jbGllbnQuc3RhcnRRdWVyeUV4ZWN1dGlvbihyZXF1ZXN0UGFyYW1zLCAoZXJyLCBkYXRhKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGVyciAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzb2x2ZShkYXRhLlF1ZXJ5RXhlY3V0aW9uSWQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0UXVlcnlSZXN1bHRzPFQ+KHF1ZXJ5RXhlY3V0aW9uSWQ6IHN0cmluZyk6IFByb21pc2U8VFtdPiB7XG4gICAgICAgIGNvbnN0IHJlcXVlc3RQYXJhbXM6IEF0aGVuYS5UeXBlcy5HZXRRdWVyeUV4ZWN1dGlvbklucHV0ID0ge1xuICAgICAgICAgICAgUXVlcnlFeGVjdXRpb25JZDogcXVlcnlFeGVjdXRpb25JZCxcbiAgICAgICAgfTtcblxuICAgICAgICBsZXQgY29sdW1uczogQXRoZW5hQ29sdW1uW107XG5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPGFueT4oKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRoaXMuY2xpZW50LmdldFF1ZXJ5UmVzdWx0cyhyZXF1ZXN0UGFyYW1zLCAoKGVyciwgZGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29sdW1ucyA9IHRoaXMuc2V0Q29sdW1uUGFyc2VycyhkYXRhKTtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHRzID0gdGhpcy5wYXJzZVJvd3MoZGF0YS5SZXN1bHRTZXQuUm93cywgY29sdW1ucyk7XG5cbiAgICAgICAgICAgICAgICByZXNvbHZlKHJlc3VsdHMpO1xuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9KSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBwYXJzZVJvd3M8VD4ocm93czogQXRoZW5hLlJvd1tdLCBjb2x1bW5zOiBBdGhlbmFDb2x1bW5bXSk6IFRbXSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdHM6IFRbXSA9IFtdO1xuXG4gICAgICAgIC8vIFN0YXJ0IGJ5IDEgYmVjYXVzZSBmaXJzdCBsaW5lIGlzIGNvbHVtbiB0aXRsZVxuICAgICAgICBmb3IgKGxldCByb3dJbmRleCA9IDE7IHJvd0luZGV4IDwgcm93cy5sZW5ndGg7IHJvd0luZGV4KyspIHtcbiAgICAgICAgICAgIGNvbnN0IHJvdyA9IHJvd3Nbcm93SW5kZXhdO1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0OiBUID0gPFQ+e307XG5cbiAgICAgICAgICAgIGZvciAobGV0IHJvd0RhdGFJbmRleCA9IDA7IHJvd0RhdGFJbmRleCA8IHJvdy5EYXRhLmxlbmd0aDsgcm93RGF0YUluZGV4KyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCByb3dEYXRhID0gcm93LkRhdGFbcm93RGF0YUluZGV4XTtcbiAgICAgICAgICAgICAgICBjb25zdCBjb2x1bW4gPSBjb2x1bW5zW3Jvd0RhdGFJbmRleF07XG5cbiAgICAgICAgICAgICAgICByZXN1bHRbY29sdW1uLm5hbWVdID0gY29sdW1uLnBhcnNlKHJvd0RhdGEuVmFyQ2hhclZhbHVlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVzdWx0cy5wdXNoKHJlc3VsdCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9XG5cbiAgICBwcml2YXRlIHNldENvbHVtblBhcnNlcnMoZGF0YSk6IEF0aGVuYUNvbHVtbltdIHtcbiAgICAgICAgY29uc3QgY29sdW1uczogQXRoZW5hQ29sdW1uW10gPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IGNvbHVtbkluZm8gb2YgZGF0YS5SZXN1bHRTZXQuUmVzdWx0U2V0TWV0YWRhdGEuQ29sdW1uSW5mbykge1xuICAgICAgICAgICAgY29uc3QgY29sdW1uID0gbmV3IEF0aGVuYUNvbHVtbigpO1xuICAgICAgICAgICAgY29sdW1uLm5hbWUgPSBjb2x1bW5JbmZvLk5hbWU7XG5cbiAgICAgICAgICAgIHN3aXRjaCAoY29sdW1uSW5mby5UeXBlIGFzIEF0aGVuYURhdGFUeXBlRW51bSkge1xuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkludGVnZXI6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uVGlueUludDpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5TbWFsbEludDpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5CaWdJbnQ6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uRmxvYXQ6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uRG91YmxlOlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkRlY2ltYWw6XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbi5wYXJzZSA9IEF0aGVuYUNvbHVtbi5wYXJzZU51bWJlcjtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5DaGFyOlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLlZhcmNoYXI6XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbi5wYXJzZSA9IEF0aGVuYUNvbHVtbi5wYXJzZVN0cmluZztcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5Cb29sZWFuOlxuICAgICAgICAgICAgICAgICAgICBjb2x1bW4ucGFyc2UgPSBBdGhlbmFDb2x1bW4ucGFyc2VCb29sZWFuO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLkRhdGU6XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uVGltZXN0YW1wOlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLlRpbWVzdGFtcFdpdGhUejpcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uLnBhcnNlID0gQXRoZW5hQ29sdW1uLnBhcnNlRGF0ZTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5BcnJheTpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5Kc29uOlxuICAgICAgICAgICAgICAgICAgICBjb2x1bW4ucGFyc2UgPSBBdGhlbmFDb2x1bW4ucGFyc2VBcnJheTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSBBdGhlbmFEYXRhVHlwZUVudW0uQmluYXJ5OlxuICAgICAgICAgICAgICAgIGNhc2UgQXRoZW5hRGF0YVR5cGVFbnVtLk1hcDpcbiAgICAgICAgICAgICAgICBjYXNlIEF0aGVuYURhdGFUeXBlRW51bS5TdHJ1Y3Q6XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb2x1bW4gdHlwZSAnJHtjb2x1bW5JbmZvLlR5cGV9JyBub3Qgc3VwcG9ydGVkYCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbHVtbnMucHVzaChjb2x1bW4pO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGNvbHVtbnM7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhc3luYyB3YWl0VW50aWxTdWNjZWVkUXVlcnkocXVlcnlFeGVjdXRpb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IHJlcXVlc3RQYXJhbXM6IEF0aGVuYS5UeXBlcy5HZXRRdWVyeUV4ZWN1dGlvbklucHV0ID0ge1xuICAgICAgICAgICAgUXVlcnlFeGVjdXRpb25JZDogcXVlcnlFeGVjdXRpb25JZCxcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5jbGllbnQuZ2V0UXVlcnlFeGVjdXRpb24ocmVxdWVzdFBhcmFtcywgKGFzeW5jIChlcnIsIGRhdGEpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChlcnIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHN3aXRjaCAoZGF0YS5RdWVyeUV4ZWN1dGlvbi5TdGF0dXMuU3RhdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnU1VDQ0VFREVEJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ1FVRVVFRCc6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ1JVTk5JTkcnOlxuICAgICAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy53YWl0VW50aWxTdWNjZWVkUXVlcnkocXVlcnlFeGVjdXRpb25JZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSwgdGhpcy5jb25maWcud2FpdFRpbWUgKiAxMDAwKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnQ0FOQ0VMTEVEJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYFF1ZXJ5IGNhbmNlbGxlZGApKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ0ZBSUxFRCc6XG4gICAgICAgICAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBRdWVyeSBmYWlsZWRgKSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgUXVlcnkgU3RhdHVzICcke2RhdGEuUXVlcnlFeGVjdXRpb24uU3RhdHVzLlN0YXRlfScgbm90IHN1cHBvcnRlZGApKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9KTtcblxuICAgIH1cbn1cblxuY2xhc3MgQXRoZW5hQ29sdW1uIHtcbiAgICBwdWJsaWMgbmFtZTogc3RyaW5nO1xuICAgIHB1YmxpYyBwYXJzZTogKHZhbHVlOiBzdHJpbmcpID0+IGFueTtcblxuICAgIHB1YmxpYyBzdGF0aWMgcGFyc2VOdW1iZXIodmFsdWU6IHN0cmluZyk6IG51bWJlciB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IE51bWJlcih2YWx1ZSk7XG5cbiAgICAgICAgaWYgKGlzTmFOKHJlc3VsdCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVGhlIHZhbHVlICcke3ZhbHVlfSAnaXMgbm90IGEgbnVtYmVyYCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHB1YmxpYyBzdGF0aWMgcGFyc2VTdHJpbmcodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc3RhdGljIHBhcnNlQm9vbGVhbih2YWx1ZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICB2YWx1ZSA9PT0gJ3RydWUnXG4gICAgICAgICAgICB8fCB2YWx1ZSA9PT0gJ1RSVUUnXG4gICAgICAgICAgICB8fCB2YWx1ZSA9PT0gJ3QnXG4gICAgICAgICAgICB8fCB2YWx1ZSA9PT0gJ1QnXG4gICAgICAgICAgICB8fCB2YWx1ZSA9PT0gJ3llcydcbiAgICAgICAgICAgIHx8IHZhbHVlID09PSAnWUVTJ1xuICAgICAgICAgICAgfHwgdmFsdWUgPT09ICcxJ1xuICAgICAgICApO1xuICAgIH1cblxuICAgIHB1YmxpYyBzdGF0aWMgcGFyc2VEYXRlKHZhbHVlOiBzdHJpbmcpOiBEYXRlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBEYXRlKHZhbHVlKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgc3RhdGljIHBhcnNlQXJyYXkodmFsdWU6IHN0cmluZyk6IGFueVtdIHtcbiAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UodmFsdWUpO1xuICAgIH1cbn1cbiJdfQ==
