export class Column {
    public name: string;
    public parse: (value: string) => any;

    /**
     * Parses string to number
     *
     * @static
     * @param {string} value - string to parse
     * @returns {number} - parsed number
     * @memberof AthenaColumn
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
     * @memberof AthenaColumn
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
     * @memberof AthenaColumn
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
     * @memberof AthenaColumn
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
     * @memberof AthenaColumn
     */
    public static parseArray(arrayInString: string): number[] | string[] {
        arrayInString = arrayInString.replace(/\[|\]/gi, '');

        if (arrayInString == null || arrayInString === '') {
            return [];
        }

        const values = arrayInString.split(', ');
        const result = [];

        for (const value of values) {
            let numberValue = Number(value);

            if (!Number.isNaN(numberValue)) {
                result.push(numberValue);
            } else {
                result.push(value);
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
     * @memberof AthenaColumn
     */
    public static parseJson(value: string): any[] {
        return JSON.parse(value);
    }
}
