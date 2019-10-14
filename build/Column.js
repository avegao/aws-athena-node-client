"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Column {
    /**
     * Parses string to number
     *
     * @static
     * @param {string} value - string to parse
     * @returns {number} - parsed number
     * @memberof AthenaColumn
     */
    static parseNumber(value) {
        const result = Number(value);
        if (isNaN(result)) {
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
    static parseString(value) {
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
    static parseBoolean(value) {
        return (value === 'true'
            || value === 'TRUE'
            || value === 't'
            || value === 'T'
            || value === 'yes'
            || value === 'YES'
            || value === '1');
    }
    /**
     * Parses string to date
     *
     * @static
     * @param {string} value - string to parse
     * @returns {Date} - parsed date
     * @memberof AthenaColumn
     */
    static parseDate(value) {
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
    static parseArray(arrayInString) {
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
            }
            else {
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
    static parseJson(value) {
        return JSON.parse(value);
    }
}
exports.Column = Column;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9Db2x1bW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxNQUFhLE1BQU07SUFLZjs7Ozs7OztPQU9HO0lBQ0ksTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFhO1FBQ25DLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUU3QixJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsY0FBYyxLQUFLLG1CQUFtQixDQUFDLENBQUM7U0FDM0Q7UUFFRCxPQUFPLE1BQU0sQ0FBQztJQUNsQixDQUFDO0lBRUQ7Ozs7Ozs7T0FPRztJQUNJLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBYTtRQUNuQyxPQUFPLEtBQUssQ0FBQztJQUNqQixDQUFDO0lBRUQ7Ozs7Ozs7T0FPRztJQUNJLE1BQU0sQ0FBQyxZQUFZLENBQUMsS0FBYTtRQUNwQyxPQUFPLENBQ0gsS0FBSyxLQUFLLE1BQU07ZUFDYixLQUFLLEtBQUssTUFBTTtlQUNoQixLQUFLLEtBQUssR0FBRztlQUNiLEtBQUssS0FBSyxHQUFHO2VBQ2IsS0FBSyxLQUFLLEtBQUs7ZUFDZixLQUFLLEtBQUssS0FBSztlQUNmLEtBQUssS0FBSyxHQUFHLENBQ25CLENBQUM7SUFDTixDQUFDO0lBRUQ7Ozs7Ozs7T0FPRztJQUNJLE1BQU0sQ0FBQyxTQUFTLENBQUMsS0FBYTtRQUNqQyxPQUFPLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzNCLENBQUM7SUFFRDs7Ozs7OztPQU9HO0lBQ0ksTUFBTSxDQUFDLFVBQVUsQ0FBQyxhQUFxQjtRQUMxQyxhQUFhLEdBQUcsYUFBYSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFckQsSUFBSSxhQUFhLElBQUksSUFBSSxJQUFJLGFBQWEsS0FBSyxFQUFFLEVBQUU7WUFDL0MsT0FBTyxFQUFFLENBQUM7U0FDYjtRQUVELE1BQU0sTUFBTSxHQUFHLGFBQWEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDekMsTUFBTSxNQUFNLEdBQUcsRUFBRSxDQUFDO1FBRWxCLEtBQUssTUFBTSxLQUFLLElBQUksTUFBTSxFQUFFO1lBQ3hCLElBQUksV0FBVyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUVoQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsRUFBRTtnQkFDNUIsTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQzthQUM1QjtpQkFBTTtnQkFDSCxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO2FBQ3RCO1NBQ0o7UUFFRCxPQUFPLE1BQU0sQ0FBQztJQUNsQixDQUFDO0lBRUQ7Ozs7Ozs7T0FPRztJQUNJLE1BQU0sQ0FBQyxTQUFTLENBQUMsS0FBYTtRQUNqQyxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDN0IsQ0FBQztDQUNKO0FBN0dELHdCQTZHQyIsImZpbGUiOiJDb2x1bW4uanMiLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgY2xhc3MgQ29sdW1uIHtcbiAgICBwdWJsaWMgbmFtZTogc3RyaW5nO1xuXG4gICAgcHVibGljIHBhcnNlOiAodmFsdWU6IHN0cmluZykgPT4gYW55O1xuXG4gICAgLyoqXG4gICAgICogUGFyc2VzIHN0cmluZyB0byBudW1iZXJcbiAgICAgKlxuICAgICAqIEBzdGF0aWNcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdmFsdWUgLSBzdHJpbmcgdG8gcGFyc2VcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfSAtIHBhcnNlZCBudW1iZXJcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ29sdW1uXG4gICAgICovXG4gICAgcHVibGljIHN0YXRpYyBwYXJzZU51bWJlcih2YWx1ZTogc3RyaW5nKTogbnVtYmVyIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gTnVtYmVyKHZhbHVlKTtcblxuICAgICAgICBpZiAoaXNOYU4ocmVzdWx0KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUaGUgdmFsdWUgJyR7dmFsdWV9ICdpcyBub3QgYSBudW1iZXJgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGFyc2VzIHN0cmluZ1xuICAgICAqXG4gICAgICogQHN0YXRpY1xuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB2YWx1ZSAtIHN0cmluZyB0byBwYXJzZVxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd9IC0gcGFyc2VkIHN0cmluZ1xuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDb2x1bW5cbiAgICAgKi9cbiAgICBwdWJsaWMgc3RhdGljIHBhcnNlU3RyaW5nKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGFyc2VzIGJvb2xlYW4tbGlrZSBBdGhlbmEgZXhwcmVzc2lvbiB0byBib29sZWFuXG4gICAgICpcbiAgICAgKiBAc3RhdGljXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHZhbHVlIC0gYm9vbGVhbi1saWtlIHN0cmluZ1xuICAgICAqIEByZXR1cm5zIHtib29sZWFufSAtIHBhcnNlZCBzdHJpbmdcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ29sdW1uXG4gICAgICovXG4gICAgcHVibGljIHN0YXRpYyBwYXJzZUJvb2xlYW4odmFsdWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgdmFsdWUgPT09ICd0cnVlJ1xuICAgICAgICAgICAgfHwgdmFsdWUgPT09ICdUUlVFJ1xuICAgICAgICAgICAgfHwgdmFsdWUgPT09ICd0J1xuICAgICAgICAgICAgfHwgdmFsdWUgPT09ICdUJ1xuICAgICAgICAgICAgfHwgdmFsdWUgPT09ICd5ZXMnXG4gICAgICAgICAgICB8fCB2YWx1ZSA9PT0gJ1lFUydcbiAgICAgICAgICAgIHx8IHZhbHVlID09PSAnMSdcbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQYXJzZXMgc3RyaW5nIHRvIGRhdGVcbiAgICAgKlxuICAgICAqIEBzdGF0aWNcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdmFsdWUgLSBzdHJpbmcgdG8gcGFyc2VcbiAgICAgKiBAcmV0dXJucyB7RGF0ZX0gLSBwYXJzZWQgZGF0ZVxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDb2x1bW5cbiAgICAgKi9cbiAgICBwdWJsaWMgc3RhdGljIHBhcnNlRGF0ZSh2YWx1ZTogc3RyaW5nKTogRGF0ZSB7XG4gICAgICAgIHJldHVybiBuZXcgRGF0ZSh2YWx1ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGFyc2VzIHN0cmluZyB0byBhcnJheVxuICAgICAqXG4gICAgICogQHN0YXRpY1xuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBhcnJheUluU3RyaW5nIC0gc3RyaW5nIHRvIHBhcnNlXG4gICAgICogQHJldHVybnMge2FueVtdfSAtIHBhcnNlZCBhcnJheVxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDb2x1bW5cbiAgICAgKi9cbiAgICBwdWJsaWMgc3RhdGljIHBhcnNlQXJyYXkoYXJyYXlJblN0cmluZzogc3RyaW5nKTogbnVtYmVyW10gfCBzdHJpbmdbXSB7XG4gICAgICAgIGFycmF5SW5TdHJpbmcgPSBhcnJheUluU3RyaW5nLnJlcGxhY2UoL1xcW3xcXF0vZ2ksICcnKTtcblxuICAgICAgICBpZiAoYXJyYXlJblN0cmluZyA9PSBudWxsIHx8IGFycmF5SW5TdHJpbmcgPT09ICcnKSB7XG4gICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB2YWx1ZXMgPSBhcnJheUluU3RyaW5nLnNwbGl0KCcsICcpO1xuICAgICAgICBjb25zdCByZXN1bHQgPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IHZhbHVlIG9mIHZhbHVlcykge1xuICAgICAgICAgICAgbGV0IG51bWJlclZhbHVlID0gTnVtYmVyKHZhbHVlKTtcblxuICAgICAgICAgICAgaWYgKCFOdW1iZXIuaXNOYU4obnVtYmVyVmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2gobnVtYmVyVmFsdWUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXN1bHQucHVzaCh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBhcnNlcyBzdHJpbmcgdG8gYXJyYXlcbiAgICAgKlxuICAgICAqIEBzdGF0aWNcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdmFsdWUgLSBzdHJpbmcgdG8gcGFyc2VcbiAgICAgKiBAcmV0dXJucyB7YW55W119IC0gcGFyc2VkIGFycmF5XG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNvbHVtblxuICAgICAqL1xuICAgIHB1YmxpYyBzdGF0aWMgcGFyc2VKc29uKHZhbHVlOiBzdHJpbmcpOiBhbnlbXSB7XG4gICAgICAgIHJldHVybiBKU09OLnBhcnNlKHZhbHVlKTtcbiAgICB9XG59XG4iXX0=
