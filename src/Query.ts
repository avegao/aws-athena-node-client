'use strict';

import {formatQuery} from 'pg-promise/lib/formatting';

export class Query {
    public readonly id: string;
    public athenaId: string;
    public readonly originalSql: string;
    public readonly parameters: Object;
    public status: string;
    public sql: string;

    public constructor(sql: string, parameters?: Object, id?: string) {
        this.originalSql = sql;
        this.parameters = parameters;
        this.id = id;
        this.sql = formatQuery(sql, parameters);
    }
}
