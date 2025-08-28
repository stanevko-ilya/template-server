// JSON
JSON.copy = function(obj) { return this.parse(this.stringify(obj)) }

// Number
Number.prototype.toStringWithZeros = function() {
    const value = this.valueOf();
    return Number.isInteger(value) && 0 <= value && value < 10 ? `0${value}` : value;
};

// Array
Array.prototype.isEmpty = function() { return this.length === 0};
Array.prototype.shuffle = function() {
    for (let i = this.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [this[i], this[j]] = [this[j], this[i]];
    }
    return this;
}
Array.prototype.clone = function() {
    const new_arr = [];
    this.forEach((value, index) => {
        if (value instanceof Object) value = Array.isArray(value) ? value.clone() : Object.isObject(value) ? Object.clone(value) : value;
        new_arr[index] = value;
    });
    return new_arr;
}
Array.prototype.target = function (target) { return target.every(element => this.includes(element)) }
Array.prototype.equal = function (arr) { return this.target(arr) && arr.target(this) }
Array.prototype.getDepth = function () { return Array.isArray(this) ? 1 + Math.max(0, ...this.map(item => item.getDepth())) : 0; }

// Object
Object.isObject = value => typeof value === 'object' && !Array.isArray(value) && value !== null && value.toString() === '[object Object]';
Object.clone = function(object) {
    const new_object = {};
    for (const key in object) {
        let value = object[key];
        if (Object.isObject(value)) value = Object.clone(value);
        new_object[key] = value;
    }
    return new_object;
}

// Date
Date.prototype.toShortDate = function(year=false) {
    let str = `${this.getDate().toStringWithZeros()}.${(this.getMonth() + 1).toStringWithZeros()}`;
    if (year) str += `.${this.getFullYear()}`;
    return str;
}
Date.prototype.toUTCZone = function() {
    this.setTime(this.getTime() + this.getTimezoneOffset() * 6e4);
    return this;
}
Date.prototype.isValid = function() { return !isNaN(this) }
Date.prototype.toTimeDate = function() { return `${this.toShortDate(true)} ${this.getHours().toStringWithZeros()}:${this.getMinutes().toStringWithZeros()}` }