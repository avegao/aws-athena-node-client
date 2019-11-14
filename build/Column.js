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

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9Db2x1bW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxNQUFhLE1BQU07SUFJZjs7Ozs7OztPQU9HO0lBQ0ksTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFhO1FBQ25DLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUU3QixJQUFJLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDdEIsTUFBTSxJQUFJLEtBQUssQ0FBQyxjQUFjLEtBQUssbUJBQW1CLENBQUMsQ0FBQztTQUMzRDtRQUVELE9BQU8sTUFBTSxDQUFDO0lBQ2xCLENBQUM7SUFFRDs7Ozs7OztPQU9HO0lBQ0ksTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFhO1FBQ25DLE9BQU8sS0FBSyxDQUFDO0lBQ2pCLENBQUM7SUFFRDs7Ozs7OztPQU9HO0lBQ0ksTUFBTSxDQUFDLFlBQVksQ0FBQyxLQUFhO1FBQ3BDLE9BQU8sQ0FDSCxLQUFLLEtBQUssTUFBTTtlQUNiLEtBQUssS0FBSyxNQUFNO2VBQ2hCLEtBQUssS0FBSyxHQUFHO2VBQ2IsS0FBSyxLQUFLLEdBQUc7ZUFDYixLQUFLLEtBQUssS0FBSztlQUNmLEtBQUssS0FBSyxLQUFLO2VBQ2YsS0FBSyxLQUFLLEdBQUcsQ0FDbkIsQ0FBQztJQUNOLENBQUM7SUFFRDs7Ozs7OztPQU9HO0lBQ0ksTUFBTSxDQUFDLFNBQVMsQ0FBQyxLQUFhO1FBQ2pDLE9BQU8sSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDM0IsQ0FBQztJQUVEOzs7Ozs7O09BT0c7SUFDSSxNQUFNLENBQUMsVUFBVSxDQUFDLGFBQXFCO1FBQzFDLGFBQWEsR0FBRyxhQUFhLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVyRCxJQUFJLGFBQWEsSUFBSSxJQUFJLElBQUksYUFBYSxLQUFLLEVBQUUsRUFBRTtZQUMvQyxPQUFPLEVBQUUsQ0FBQztTQUNiO1FBRUQsTUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN6QyxNQUFNLE1BQU0sR0FBRyxFQUFFLENBQUM7UUFFbEIsS0FBSyxNQUFNLEtBQUssSUFBSSxNQUFNLEVBQUU7WUFDeEIsSUFBSSxXQUFXLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRWhDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxFQUFFO2dCQUM1QixNQUFNLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO2FBQzVCO2lCQUFNO2dCQUNILE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7YUFDdEI7U0FDSjtRQUVELE9BQU8sTUFBTSxDQUFDO0lBQ2xCLENBQUM7SUFFRDs7Ozs7OztPQU9HO0lBQ0ksTUFBTSxDQUFDLFNBQVMsQ0FBQyxLQUFhO1FBQ2pDLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM3QixDQUFDO0NBQ0o7QUE1R0Qsd0JBNEdDIiwiZmlsZSI6IkNvbHVtbi5qcyIsInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCBjbGFzcyBDb2x1bW4ge1xuICAgIHB1YmxpYyBuYW1lOiBzdHJpbmc7XG4gICAgcHVibGljIHBhcnNlOiAodmFsdWU6IHN0cmluZykgPT4gYW55O1xuXG4gICAgLyoqXG4gICAgICogUGFyc2VzIHN0cmluZyB0byBudW1iZXJcbiAgICAgKlxuICAgICAqIEBzdGF0aWNcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdmFsdWUgLSBzdHJpbmcgdG8gcGFyc2VcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfSAtIHBhcnNlZCBudW1iZXJcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ29sdW1uXG4gICAgICovXG4gICAgcHVibGljIHN0YXRpYyBwYXJzZU51bWJlcih2YWx1ZTogc3RyaW5nKTogbnVtYmVyIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gTnVtYmVyKHZhbHVlKTtcblxuICAgICAgICBpZiAoTnVtYmVyLmlzTmFOKHJlc3VsdCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVGhlIHZhbHVlICcke3ZhbHVlfSAnaXMgbm90IGEgbnVtYmVyYCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBhcnNlcyBzdHJpbmdcbiAgICAgKlxuICAgICAqIEBzdGF0aWNcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gdmFsdWUgLSBzdHJpbmcgdG8gcGFyc2VcbiAgICAgKiBAcmV0dXJucyB7c3RyaW5nfSAtIHBhcnNlZCBzdHJpbmdcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ29sdW1uXG4gICAgICovXG4gICAgcHVibGljIHN0YXRpYyBwYXJzZVN0cmluZyh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBhcnNlcyBib29sZWFuLWxpa2UgQXRoZW5hIGV4cHJlc3Npb24gdG8gYm9vbGVhblxuICAgICAqXG4gICAgICogQHN0YXRpY1xuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB2YWx1ZSAtIGJvb2xlYW4tbGlrZSBzdHJpbmdcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gLSBwYXJzZWQgc3RyaW5nXG4gICAgICogQG1lbWJlcm9mIEF0aGVuYUNvbHVtblxuICAgICAqL1xuICAgIHB1YmxpYyBzdGF0aWMgcGFyc2VCb29sZWFuKHZhbHVlOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgIHZhbHVlID09PSAndHJ1ZSdcbiAgICAgICAgICAgIHx8IHZhbHVlID09PSAnVFJVRSdcbiAgICAgICAgICAgIHx8IHZhbHVlID09PSAndCdcbiAgICAgICAgICAgIHx8IHZhbHVlID09PSAnVCdcbiAgICAgICAgICAgIHx8IHZhbHVlID09PSAneWVzJ1xuICAgICAgICAgICAgfHwgdmFsdWUgPT09ICdZRVMnXG4gICAgICAgICAgICB8fCB2YWx1ZSA9PT0gJzEnXG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGFyc2VzIHN0cmluZyB0byBkYXRlXG4gICAgICpcbiAgICAgKiBAc3RhdGljXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHZhbHVlIC0gc3RyaW5nIHRvIHBhcnNlXG4gICAgICogQHJldHVybnMge0RhdGV9IC0gcGFyc2VkIGRhdGVcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ29sdW1uXG4gICAgICovXG4gICAgcHVibGljIHN0YXRpYyBwYXJzZURhdGUodmFsdWU6IHN0cmluZyk6IERhdGUge1xuICAgICAgICByZXR1cm4gbmV3IERhdGUodmFsdWUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBhcnNlcyBzdHJpbmcgdG8gYXJyYXlcbiAgICAgKlxuICAgICAqIEBzdGF0aWNcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gYXJyYXlJblN0cmluZyAtIHN0cmluZyB0byBwYXJzZVxuICAgICAqIEByZXR1cm5zIHthbnlbXX0gLSBwYXJzZWQgYXJyYXlcbiAgICAgKiBAbWVtYmVyb2YgQXRoZW5hQ29sdW1uXG4gICAgICovXG4gICAgcHVibGljIHN0YXRpYyBwYXJzZUFycmF5KGFycmF5SW5TdHJpbmc6IHN0cmluZyk6IG51bWJlcltdIHwgc3RyaW5nW10ge1xuICAgICAgICBhcnJheUluU3RyaW5nID0gYXJyYXlJblN0cmluZy5yZXBsYWNlKC9cXFt8XFxdL2dpLCAnJyk7XG5cbiAgICAgICAgaWYgKGFycmF5SW5TdHJpbmcgPT0gbnVsbCB8fCBhcnJheUluU3RyaW5nID09PSAnJykge1xuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdmFsdWVzID0gYXJyYXlJblN0cmluZy5zcGxpdCgnLCAnKTtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gW107XG5cbiAgICAgICAgZm9yIChjb25zdCB2YWx1ZSBvZiB2YWx1ZXMpIHtcbiAgICAgICAgICAgIGxldCBudW1iZXJWYWx1ZSA9IE51bWJlcih2YWx1ZSk7XG5cbiAgICAgICAgICAgIGlmICghTnVtYmVyLmlzTmFOKG51bWJlclZhbHVlKSkge1xuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKG51bWJlclZhbHVlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2godmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQYXJzZXMgc3RyaW5nIHRvIGFycmF5XG4gICAgICpcbiAgICAgKiBAc3RhdGljXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHZhbHVlIC0gc3RyaW5nIHRvIHBhcnNlXG4gICAgICogQHJldHVybnMge2FueVtdfSAtIHBhcnNlZCBhcnJheVxuICAgICAqIEBtZW1iZXJvZiBBdGhlbmFDb2x1bW5cbiAgICAgKi9cbiAgICBwdWJsaWMgc3RhdGljIHBhcnNlSnNvbih2YWx1ZTogc3RyaW5nKTogYW55W10ge1xuICAgICAgICByZXR1cm4gSlNPTi5wYXJzZSh2YWx1ZSk7XG4gICAgfVxufVxuIl19
