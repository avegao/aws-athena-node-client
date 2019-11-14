"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const formatting_1 = require("pg-promise/lib/formatting");
class Query {
    constructor(sql, parameters, id) {
        this.results = [];
        this.originalSql = sql;
        this.parameters = parameters;
        this.id = id;
        this.sql = formatting_1.formatQuery(sql, parameters);
    }
    hasColumns() {
        var _a;
        return ((_a = this.columns) === null || _a === void 0 ? void 0 : _a.length) > 0;
    }
    hasResults() {
        var _a;
        return ((_a = this.results) === null || _a === void 0 ? void 0 : _a.length) > 0;
    }
}
exports.Query = Query;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9RdWVyeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLDBEQUFzRDtBQUd0RCxNQUFhLEtBQUs7SUFXZCxZQUFtQixHQUFXLEVBQUUsVUFBbUIsRUFBRSxFQUFXO1FBSHpELFlBQU8sR0FBUSxFQUFFLENBQUM7UUFJckIsSUFBSSxDQUFDLFdBQVcsR0FBRyxHQUFHLENBQUM7UUFDdkIsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7UUFDN0IsSUFBSSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUM7UUFDYixJQUFJLENBQUMsR0FBRyxHQUFHLHdCQUFXLENBQUMsR0FBRyxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFFTSxVQUFVOztRQUNiLE9BQU8sT0FBQSxJQUFJLENBQUMsT0FBTywwQ0FBRSxNQUFNLElBQUcsQ0FBQyxDQUFDO0lBQ3BDLENBQUM7SUFFTSxVQUFVOztRQUNiLE9BQU8sT0FBQSxJQUFJLENBQUMsT0FBTywwQ0FBRSxNQUFNLElBQUcsQ0FBQyxDQUFDO0lBQ3BDLENBQUM7Q0FDSjtBQXpCRCxzQkF5QkMiLCJmaWxlIjoiUXVlcnkuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge2Zvcm1hdFF1ZXJ5fSBmcm9tICdwZy1wcm9taXNlL2xpYi9mb3JtYXR0aW5nJztcbmltcG9ydCB7Q29sdW1ufSBmcm9tICcuL0NvbHVtbic7XG5cbmV4cG9ydCBjbGFzcyBRdWVyeTxUID0gYW55PiB7XG4gICAgcHVibGljIGlkOiBzdHJpbmc7XG4gICAgcHVibGljIGF0aGVuYUlkOiBzdHJpbmc7XG4gICAgcHVibGljIHJlYWRvbmx5IG9yaWdpbmFsU3FsOiBzdHJpbmc7XG4gICAgcHVibGljIHJlYWRvbmx5IHBhcmFtZXRlcnM6IE9iamVjdDtcbiAgICBwdWJsaWMgc3RhdHVzOiBzdHJpbmc7XG4gICAgcHVibGljIHNxbDogc3RyaW5nO1xuICAgIHB1YmxpYyB3YWl0VGltZTogbnVtYmVyO1xuICAgIHB1YmxpYyByZXN1bHRzOiBUW10gPSBbXTtcbiAgICBwdWJsaWMgY29sdW1uczogQ29sdW1uW107XG5cbiAgICBwdWJsaWMgY29uc3RydWN0b3Ioc3FsOiBzdHJpbmcsIHBhcmFtZXRlcnM/OiBPYmplY3QsIGlkPzogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMub3JpZ2luYWxTcWwgPSBzcWw7XG4gICAgICAgIHRoaXMucGFyYW1ldGVycyA9IHBhcmFtZXRlcnM7XG4gICAgICAgIHRoaXMuaWQgPSBpZDtcbiAgICAgICAgdGhpcy5zcWwgPSBmb3JtYXRRdWVyeShzcWwsIHBhcmFtZXRlcnMpO1xuICAgIH1cblxuICAgIHB1YmxpYyBoYXNDb2x1bW5zKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5jb2x1bW5zPy5sZW5ndGggPiAwO1xuICAgIH1cblxuICAgIHB1YmxpYyBoYXNSZXN1bHRzKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZXN1bHRzPy5sZW5ndGggPiAwO1xuICAgIH1cbn1cbiJdfQ==
