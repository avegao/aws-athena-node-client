export declare class Query {
    readonly id: string;
    athenaId: string;
    readonly originalSql: string;
    readonly parameters: Object;
    status: string;
    sql: string;
    constructor(sql: string, parameters?: Object, id?: string);
}
