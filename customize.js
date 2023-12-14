// Number
Number.prototype.toStringWithZeros = function () { return Number.isInteger(this) && 0 <= this < 10 ? `0${this}` : this.toString() };

// Array
Array.prototype.isEmpty = function () { return this.length === 0 };
Array.prototype.shuffle = function () {
    for (let i = this.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [this[i], this[j]] = [this[j], this[i]];
    }
    return this;
}
Array.prototype.clone = function () {
    const new_arr = [];
    this.forEach((value, index) => {
        if (value instanceof Object) value = value.clone();
        new_arr[index] = value;
    });
    return new_arr;
}

// Object
Object.prototype.clone = function () {
    const new_object = {};
    for (const key in this) {
        let value = this[key];
        if (value instanceof Object) value = value.clone();
        new_object[key] = value;
    }
    return new_object;
}

// Date
Date.prototype.toShortDate = function (year=false) {
    let str = `${this.getDate().toStringWithZeros()}.${(this.getMonth() + 1).toStringWithZeros()}`;
    if (year) str += `.${this.getFullYear()}`;

    return str;
}
