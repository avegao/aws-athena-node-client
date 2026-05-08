import destr from 'destr';

export type ColumnParse = (value: string) => unknown;

export class Column {
    public constructor(
        public readonly name: string,
        public readonly parse: ColumnParse,
    ) {}

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
        switch (value) {
            case '1':
            case 'T':
            case 'TRUE':
            case 'YES':
            case 't':
            case 'true':
            case 'yes':
                return true;

            default:
                return false;
        }
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
        const normalizedArray = arrayInString.replace(/[[\]]/g, '');

        if (normalizedArray === '') {
            return [];
        }

        const values = normalizedArray.split(', ');
        const result = Array<number | string>(values.length);

        for (let index = 0; index < values.length; index++) {
            const value = values[index] as string;
            const numberValue = Number(value);

            result[index] = Number.isNaN(numberValue) ? value : numberValue;
        }

        return result as number[] | string[];
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
