// @ts-ignore
import {formatQuery} from 'pg-promise/lib/formatting.js';
import {Column} from './Column.js';
import {type QueryExecutionState} from '@aws-sdk/client-athena';

export class Query<T> {
    public id?: string;
    public athenaId?: string;
    public readonly originalSql: string;
    public readonly parameters?: Record<string, unknown>;
    public status?: QueryExecutionState;
    public sql: string;
    public waitTime: number;
    public results: T[] = [];
    public columns: Column[];
    public cacheInMinutes?: number;
    public s3Location?: string;

    public constructor(sql: string, waitTime: number = 0.5, parameters?: Record<string, unknown>, id?: string) {
        this.originalSql = sql;
        this.parameters = parameters;
        this.id = id;
        this.sql = formatQuery(sql, parameters);
        this.waitTime = waitTime;
        this.columns = [];
    }

    public hasColumns(): boolean {
        return this.columns.length > 0;
    }

    public hasResults(): boolean {
        return this.results?.length > 0;
    }
}
