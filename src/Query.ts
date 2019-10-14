'use strict';

import {formatQuery} from 'pg-promise/lib/formatting';

export class Query {
    public id: string;
    public athenaId: string;
    public readonly originalSql: string;
    public readonly parameters: Object;
    public status: string;
    public sql: string;
    public waitTime: number;

    public constructor(sql: string, parameters?: Object, id?: string) {
        this.originalSql = sql;
        this.parameters = parameters;
        this.id = id;
        this.sql = formatQuery(sql, parameters);
    }
}
