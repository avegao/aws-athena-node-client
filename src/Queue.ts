import {Query} from './Query.js';
import {isEmpty} from 'lodash-es';

export class Queue {
    public queries: Query<unknown>[] = [];

    public addQuery(query: Query<unknown>): void {
        if (isEmpty(query.id)) {
            query.id = query.athenaId;
        }

        this.queries.push(query);
    }

    public removeQuery(query: Query<unknown>): void {
        const index = this.queries.indexOf(query);

        if (index > -1) {
            this.queries.splice(index, 1);
        }
    }

    public getQueryById(id: string): Query<unknown> {
        const query = this.queries.find((query) => query.id === id);

        if (query == null) {
            throw new Error('Query ID not found');
        } else {
            return query;
        }
    }
}
