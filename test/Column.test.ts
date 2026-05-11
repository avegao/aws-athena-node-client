import {describe, expect, test} from 'vite-plus/test';

import {Column} from '../src/Column.js';

describe('Column', () => {
    test('parseNumber parses valid numbers', () => {
        expect(Column.parseNumber('12.5')).toBe(12.5);
        expect(Column.parseNumber('0')).toBe(0);
    });

    test('parseNumber throws for invalid numbers', () => {
        expect(() => Column.parseNumber('foo')).toThrowError("The value 'foo 'is not a number");
    });

    test('parseBoolean handles Athena truthy and falsy values', () => {
        expect(Column.parseBoolean('true')).toBe(true);
        expect(Column.parseBoolean('TRUE')).toBe(true);
        expect(Column.parseBoolean('yes')).toBe(true);
        expect(Column.parseBoolean('1')).toBe(true);
        expect(Column.parseBoolean('false')).toBe(false);
        expect(Column.parseBoolean('0')).toBe(false);
    });

    test('parseArray parses number and string arrays', () => {
        expect(Column.parseArray('[1, 2, 3]')).toEqual([1, 2, 3]);
        expect(Column.parseArray('[foo, bar]')).toEqual(['foo', 'bar']);
        expect(Column.parseArray('[]')).toEqual([]);
    });

    test('parseJson delegates to destr', () => {
        expect(Column.parseJson('{"ok":true,"count":2}')).toEqual({
            ok: true,
            count: 2,
        });
    });
});
