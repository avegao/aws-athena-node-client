export default class TypeChecker {
    private readonly len: number;
    private readonly str: string;

    constructor(str: string) {
        this.str = str;
        this.len = str.length;
    }

    public parse(): any {
        if (this.isArray()) {
            return this.parseStringArray();
        } else if (this.isObject()) {
            return this.parseStringObject();
        } else if (this.isDate()) {
            return this.parseStringDate();
        } else if (this.isNumber()) {
            return this.parseStringNumber();
        } else {
            return this.str;
        }
    }

    private isNumber(): boolean {
        return !isNaN(Number(this.str));
    }

    private isArray(): boolean {
        return this.str[0] === '[' && this.str[this.len - 1] === ']';
    }

    private isObject(): boolean {
        return this.str[0] === '{' && this.str[this.len - 1] === '}';
    }

    private isDate(): boolean {
        return !isNaN(Date.parse(this.str));
    }

    private parseStringArray(): any[] {
        return JSON.parse(this.str);
    }

    private parseStringNumber(): number {
        return Number(this.str);
    }

    private parseStringDate(): Date {
        return new Date(this.str);
    }

    private parseStringObject(): object {
        return JSON.parse(this.str);
    }
}
