import destr from 'destr';

export type ColumnParse = (value: string) => unknown;

export class Column {
    public name: string;
    public parse: (value: string) => unknown;

    public constructor(name: string, parse: ColumnParse) {
        this.name = name;
        this.parse = parse;
    }

    /**
     * Parses string to number
     *
     * @static
     * @param {string} value - string to parse
     * @returns {number} - parsed number
     */
    public static parseNumber(value: string): number {
        const result = Number(value);

        if (Number.isNaN(result)) {
            throw new Error(`The value '${value} 'is not a number`);
        }

        return result;
    }

    /**
     * Parses string
     *
     * @static
     * @param {string} value - string to parse
     * @returns {string} - parsed string
     */
    public static parseString(value: string): string {
        return value;
    }

    /**
     * Parses boolean-like Athena expression to boolean
     *
     * @static
     * @param {string} value - boolean-like string
     * @returns {boolean} - parsed string
     */
    public static parseBoolean(value: string): boolean {
        return (
            value === 'true'
            || value === 'TRUE'
            || value === 't'
            || value === 'T'
            || value === 'yes'
            || value === 'YES'
            || value === '1'
        );
    }

    /**
     * Parses string to date
     *
     * @static
     * @param {string} value - string to parse
     * @returns {Date} - parsed date
     */
    public static parseDate(value: string): Date {
        return new Date(value);
    }

    /**
     * Parses string to array
     *
     * @static
     * @param {string} arrayInString - string to parse
     * @returns {any[]} - parsed array
     */
    public static parseArray(arrayInString: string): number[] | string[] {
        arrayInString = arrayInString.replace(/[\[\]]/gi, '');

        if (arrayInString == null || arrayInString === '') {
            return [];
        }

        const values = arrayInString.split(', ');
        const result: number[] | string[] = [];

        for (const value of values) {
            let numberValue = Number(value);

            if (!Number.isNaN(numberValue)) {
                result.push(numberValue as never);
            } else {
                result.push(value as never);
            }
        }

        return result;
    }

    /**
     * Parses string to array
     *
     * @static
     * @param {string} value - string to parse
     * @returns {any[]} - parsed array
     */
    public static parseJson(value: string): unknown[] {
        return destr(value);
    }
}
