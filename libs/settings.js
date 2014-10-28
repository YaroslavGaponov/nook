/*
 nookfs
 Copyright (c) 2014 Yaroslav Gaponov <yaroslav.gaponov@gmail.com>
*/
var fs = require('fs');

module.exports = JSON.parse(fs.readFileSync('../etc/settings.json'));