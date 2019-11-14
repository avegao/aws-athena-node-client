import {formatQuery} from 'pg-promise/lib/formatting';
import {Column} from './Column';

export class Query<T = any> {
    public id: string;
    public athenaId: string;
    public readonly originalSql: string;
    public readonly parameters: Object;
    public status: string;
    public sql: string;
    public waitTime: number;
    public results: T[] = [];
    public columns: Column[];

    public constructor(sql: string, parameters?: Object, id?: string) {
        this.originalSql = sql;
        this.parameters = parameters;
        this.id = id;
        this.sql = formatQuery(sql, parameters);
    }

    public hasColumns(): boolean {
        return this.columns?.length > 0;
    }

    public hasResults(): boolean {
        return this.results?.length > 0;
    }
}
