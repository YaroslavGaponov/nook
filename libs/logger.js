/*
 nookfs
 Copyright (c) 2014 Yaroslav Gaponov <yaroslav.gaponov@gmail.com>
*/

var util = require('util');

var LogLevel = {
    INFO: 1 << 0,
    DEBUG: 1 << 2,
    TRACE: 1 << 3,
    WARN: 1 << 4,
    ERROR: 1 << 5,
    getName: function (level) {
        switch (level) {
        case LogLevel.INFO:
            return 'INFO';
        case LogLevel.DEBUG:
            return 'DEBUG';
        case LogLevel.TRACE:
            return 'TRACE';
        case LogLevel.WARN:
            return 'WARN';
        case LogLevel.ERROR:
            return 'ERROR';
        }
    }
}

var Logger = module.exports = function (source, level) {
    if (!(this instanceof Logger)) {
        return new Logger(source, level);
    }
    this.source = source;
    this.level = level || LogLevel.INFO;
}

Logger.prototype.print = function (level, message) {
    if ((this.level & level) == level) {
        console.log(new Date().toJSON() + ' ' + LogLevel.getName(level) + ':\t' + this.source + ': ' + message);
    }
}

Logger.prototype.info = function () {
    this.print(LogLevel.INFO, util.format.apply(null, arguments));
}

Logger.prototype.debug = function () {
    this.print(LogLevel.DEBUG, util.format.apply(null, arguments));
}

Logger.prototype.trace = function () {
    this.print(LogLevel.TRACE, util.format.apply(null, arguments));
}

Logger.prototype.warn = function () {
    this.print(LogLevel.WARN, util.format.apply(null, arguments));
}

Logger.prototype.error = function () {
    this.print(LogLevel.ERROR, util.format.apply(null, arguments));
}
