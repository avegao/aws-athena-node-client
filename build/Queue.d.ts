import { Query } from './Query';
export declare class Queue {
    queries: Query[];
    addQuery(query: Query): void;
    removeQuery(query: Query): void;
    getQueryById(id: string): Query;
}
