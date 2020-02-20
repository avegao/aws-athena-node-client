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
        const truthyValues = ['TRUE', 'T', 'YES', '1'];
        return truthyValues.includes(value.toUpperCase());
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

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9Db2x1bW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxNQUFhLE1BQU07SUFJZjs7Ozs7OztPQU9HO0lBQ0ksTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFhO1FBQ25DLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUU3QixJQUFJLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDdEIsTUFBTSxJQUFJLEtBQUssQ0FBQyxjQUFjLEtBQUssbUJBQW1CLENBQUMsQ0FBQztTQUMzRDtRQUVELE9BQU8sTUFBTSxDQUFDO0lBQ2xCLENBQUM7SUFFRDs7Ozs7OztPQU9HO0lBQ0ksTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFhO1FBQ25DLE9BQU8sS0FBSyxDQUFDO0lBQ2pCLENBQUM7SUFFRDs7Ozs7OztPQU9HO0lBQ0ksTUFBTSxDQUFDLFlBQVksQ0FBQyxLQUFhO1FBQ3BDLE1BQU0sWUFBWSxHQUFHLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDL0MsT0FBTyxZQUFZLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO0lBQ3RELENBQUM7SUFFRDs7Ozs7OztPQU9HO0lBQ0ksTUFBTSxDQUFDLFNBQVMsQ0FBQyxLQUFhO1FBQ2pDLE9BQU8sSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDM0IsQ0FBQztJQUVEOzs7Ozs7O09BT0c7SUFDSSxNQUFNLENBQUMsVUFBVSxDQUFDLGFBQXFCO1FBQzFDLGFBQWEsR0FBRyxhQUFhLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVyRCxJQUFJLGFBQWEsSUFBSSxJQUFJLElBQUksYUFBYSxLQUFLLEVBQUUsRUFBRTtZQUMvQyxPQUFPLEVBQUUsQ0FBQztTQUNiO1FBRUQsTUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN6QyxNQUFNLE1BQU0sR0FBRyxFQUFFLENBQUM7UUFFbEIsS0FBSyxNQUFNLEtBQUssSUFBSSxNQUFNLEVBQUU7WUFDeEIsSUFBSSxXQUFXLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRWhDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxFQUFFO2dCQUM1QixNQUFNLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO2FBQzVCO2lCQUFNO2dCQUNILE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7YUFDdEI7U0FDSjtRQUVELE9BQU8sTUFBTSxDQUFDO0lBQ2xCLENBQUM7SUFFRDs7Ozs7OztPQU9HO0lBQ0ksTUFBTSxDQUFDLFNBQVMsQ0FBQyxLQUFhO1FBQ2pDLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM3QixDQUFDO0NBQ0o7QUFyR0Qsd0JBcUdDIiwiZmlsZSI6IkNvbHVtbi5qcyIsInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCBjbGFzcyBDb2x1bW4ge1xuICAgIHB1YmxpYyBuYW1lOiBzdHJpbmc7XG4gICAgcHVibGljIHBhcnNlOiAodmFsdWU6IHN0cmluZykgPT4gYW55O1xuXG4gICAgLyoqXG4gICAgICogUGFyc2VzIHN0cmluZyB0byBudW1iZXJcbiAgICAgKlxuICAgICAqIEBzdGF0aWNcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdmFsdWUgLSBzdHJpbmcgdG8gcGFyc2VcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfSAtIHBhcnNlZCBudW1iZXJcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ29sdW1uXG4gICAgICovXG4gICAgcHVibGljIHN0YXRpYyBwYXJzZU51bWJlcih2YWx1ZTogc3RyaW5nKTogbnVtYmVyIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gTnVtYmVyKHZhbHVlKTtcblxuICAgICAgICBpZiAoTnVtYmVyLmlzTmFOKHJlc3VsdCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVGhlIHZhbHVlICcke3ZhbHVlfSAnaXMgbm90IGEgbnVtYmVyYCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBhcnNlcyBzdHJpbmdcbiAgICAgKlxuICAgICAqIEBzdGF0aWNcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdmFsdWUgLSBzdHJpbmcgdG8gcGFyc2VcbiAgICAgKiBAcmV0dXJucyB7c3RyaW5nfSAtIHBhcnNlZCBzdHJpbmdcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ29sdW1uXG4gICAgICovXG4gICAgcHVibGljIHN0YXRpYyBwYXJzZVN0cmluZyh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBhcnNlcyBib29sZWFuLWxpa2UgQXRoZW5hIGV4cHJlc3Npb24gdG8gYm9vbGVhblxuICAgICAqXG4gICAgICogQHN0YXRpY1xuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB2YWx1ZSAtIGJvb2xlYW4tbGlrZSBzdHJpbmdcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gLSBwYXJzZWQgc3RyaW5nXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNvbHVtblxuICAgICAqL1xuICAgIHB1YmxpYyBzdGF0aWMgcGFyc2VCb29sZWFuKHZhbHVlOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgY29uc3QgdHJ1dGh5VmFsdWVzID0gWydUUlVFJywgJ1QnLCAnWUVTJywgJzEnXTtcbiAgICAgICAgcmV0dXJuIHRydXRoeVZhbHVlcy5pbmNsdWRlcyh2YWx1ZS50b1VwcGVyQ2FzZSgpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQYXJzZXMgc3RyaW5nIHRvIGRhdGVcbiAgICAgKlxuICAgICAqIEBzdGF0aWNcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdmFsdWUgLSBzdHJpbmcgdG8gcGFyc2VcbiAgICAgKiBAcmV0dXJucyB7RGF0ZX0gLSBwYXJzZWQgZGF0ZVxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDb2x1bW5cbiAgICAgKi9cbiAgICBwdWJsaWMgc3RhdGljIHBhcnNlRGF0ZSh2YWx1ZTogc3RyaW5nKTogRGF0ZSB7XG4gICAgICAgIHJldHVybiBuZXcgRGF0ZSh2YWx1ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGFyc2VzIHN0cmluZyB0byBhcnJheVxuICAgICAqXG4gICAgICogQHN0YXRpY1xuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBhcnJheUluU3RyaW5nIC0gc3RyaW5nIHRvIHBhcnNlXG4gICAgICogQHJldHVybnMge2FueVtdfSAtIHBhcnNlZCBhcnJheVxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDb2x1bW5cbiAgICAgKi9cbiAgICBwdWJsaWMgc3RhdGljIHBhcnNlQXJyYXkoYXJyYXlJblN0cmluZzogc3RyaW5nKTogbnVtYmVyW10gfCBzdHJpbmdbXSB7XG4gICAgICAgIGFycmF5SW5TdHJpbmcgPSBhcnJheUluU3RyaW5nLnJlcGxhY2UoL1xcW3xcXF0vZ2ksICcnKTtcblxuICAgICAgICBpZiAoYXJyYXlJblN0cmluZyA9PSBudWxsIHx8IGFycmF5SW5TdHJpbmcgPT09ICcnKSB7XG4gICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB2YWx1ZXMgPSBhcnJheUluU3RyaW5nLnNwbGl0KCcsICcpO1xuICAgICAgICBjb25zdCByZXN1bHQgPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IHZhbHVlIG9mIHZhbHVlcykge1xuICAgICAgICAgICAgbGV0IG51bWJlclZhbHVlID0gTnVtYmVyKHZhbHVlKTtcblxuICAgICAgICAgICAgaWYgKCFOdW1iZXIuaXNOYU4obnVtYmVyVmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2gobnVtYmVyVmFsdWUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXN1bHQucHVzaCh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBhcnNlcyBzdHJpbmcgdG8gYXJyYXlcbiAgICAgKlxuICAgICAqIEBzdGF0aWNcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdmFsdWUgLSBzdHJpbmcgdG8gcGFyc2VcbiAgICAgKiBAcmV0dXJucyB7YW55W119IC0gcGFyc2VkIGFycmF5XG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNvbHVtblxuICAgICAqL1xuICAgIHB1YmxpYyBzdGF0aWMgcGFyc2VKc29uKHZhbHVlOiBzdHJpbmcpOiBhbnlbXSB7XG4gICAgICAgIHJldHVybiBKU09OLnBhcnNlKHZhbHVlKTtcbiAgICB9XG59XG4iXX0=
