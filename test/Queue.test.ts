import { beforeEach, describe, expect, test } from 'vitest';
import { Queue } from '../src/Queue.js';
import { Query } from '../src/Query.js';

describe('queue', () => {
	let queue: Queue;

	beforeEach(() => {
		queue = new Queue();
	});

	test('Add query to queue', () => {
		const query = new Query('SELECT 1');

		queue.addQuery(query);

		expect(queue.queries.length).toBe(1);
		expect(queue.queries[0]).toBe(query);
	});

	test('Remove query from queue', () => {
		const query = new Query('SELECT 1');

		queue.addQuery(query);

		expect(queue.queries.length).toBe(1);
		expect(queue.queries[0]).toBe(query);

		queue.removeQuery(query);

		expect(queue.queries.length).toBe(0);
		expect(queue.queries[0]).toBeUndefined();
	});

	test('Get query by id', () => {
		const id = 'abcd';
		const query = new Query('SELECT 1', undefined, undefined, id);

		queue.addQuery(query);

		expect(queue.queries.length).toBe(1);
		expect(queue.queries[0]).toBe(query);

		const queryFromQueue = queue.getQueryById(id);

		expect(queue.queries.length).toBe(1);
		expect(queue.queries[0]).toBe(query);
		expect(queryFromQueue).toBe(query);
	});

	test('Get query by id not found', () => {
		const query = new Query('SELECT 1', undefined, undefined, 'abcd');

		queue.addQuery(query);

		expect(queue.queries.length).toBe(1);
		expect(queue.queries[0]).toBe(query);

		expect(() => queue.getQueryById('ab')).toThrowError('Query ID not found');

		expect(queue.queries.length).toBe(1);
		expect(queue.queries[0]).toBe(query);
	});
});
