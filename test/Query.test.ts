import { describe, expect, test } from 'vitest';
import { Query } from '../src/Query.js';
import { Column } from '../src/Column.js';

describe('query class', () => {
  test('Query with columns and no results', () => {
    const query = new Query('SELECT 1');
    query.columns = [new Column('foo', Column.parseString)];

    expect(query.hasColumns()).toBe(true);
    expect(query.hasResults()).toBe(false);
  });

  test('Query with results and no columns', () => {
    const query = new Query('SELECT 1');
    query.results = [{ foo: 'bar' }];

    expect(query.hasColumns()).toBe(false);
    expect(query.hasResults()).toBe(true);
  });

  test('Query with columns and results', () => {
    const query = new Query('SELECT 1');
    query.columns = [new Column('foo', Column.parseString)];
    query.results = [{ foo: 'bar' }];

    expect(query.hasColumns()).toBe(true);
    expect(query.hasResults()).toBe(true);
  });

  test('Query without columns and results', () => {
    const query = new Query('SELECT 1');

    expect(query.hasColumns()).toBe(false);
    expect(query.hasResults()).toBe(false);
  });
});
