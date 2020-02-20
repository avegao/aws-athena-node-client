export default class TypeChecker {
    private readonly len;
    private readonly str;
    constructor(str: string);
    parse(): any;
    private isNumber;
    private isArray;
    private isObject;
    private isDate;
    private parseStringArray;
    private parseStringNumber;
    private parseStringDate;
    private parseStringObject;
}
