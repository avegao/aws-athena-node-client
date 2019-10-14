import { Column } from './Column';
export declare class Query<T = any> {
    id: string;
    athenaId: string;
    readonly originalSql: string;
    readonly parameters: Object;
    status: string;
    sql: string;
    waitTime: number;
    results: T[];
    columns: Column[];
    constructor(sql: string, parameters?: Object, id?: string);
    hasColumns(): boolean;
    hasResults(): boolean;
}
