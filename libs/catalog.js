/*
 nookfs
 Copyright (c) 2014 Yaroslav Gaponov <yaroslav.gaponov@gmail.com>
*/
var Utils = require('./utils');

Catalog = function() {
    this.catalog = {};
}


Catalog.prototype.reset = function(chunkServerID) {
    for (var fileName in this.catalog) {
        for (var chunkNumber in this.catalog[fileName]) {
            var indx = this.catalog[fileName][chunkNumber].indexOf(chunkServerID);
            if (indx !== -1) {
                this.catalog[fileName][chunkNumber].splice(indx, 1);
                if (this.catalog[fileName][chunkNumber].length === 0) {
                    delete this.catalog[fileName][chunkNumber];
                }
            }
        }
        if (Object.keys(this.catalog[fileName]).length === 0) {
            delete this.catalog[fileName];
        }
    }
}

Catalog.prototype.add = function(fileName, chunkNumber, chunkServerID) {
    if (!this.catalog[fileName]) {
        this.catalog[fileName] = {};
    }
    if (!this.catalog[fileName][chunkNumber]) {
        this.catalog[fileName][chunkNumber] = [];
    }
    if (this.catalog[fileName][chunkNumber].indexOf(chunkServerID) === -1) {
        this.catalog[fileName][chunkNumber].push(chunkServerID);
    }
}

Catalog.prototype.remove = function(fileName, chunkNumber, chunkServerID) {
    if (this.catalog[fileName]) {
        if (this.catalog[fileName][chunkNumber]) {
            var indx = this.catalog[fileName][chunkNumber].indexOf(chunkServerID);
            if (indx !== -1) {
                this.catalog[fileName][chunkNumber].splice(indx, 1);
            }
            if (this.catalog[fileName][chunkNumber].length === 0) {
                delete this.catalog[fileName][chunkNumber];
            }
            if (Object.keys(this.catalog[fileName]).length === 0) {
                delete this.catalog[fileName];
            }
        }
    }
}

Catalog.prototype.getChunkServers = function(fileName) {
    return this.catalog[fileName];
}

Catalog.prototype.getFiles = function() {
    var files = [];
    for (var fileName in this.catalog) {
        var chunks = Object.keys(this.catalog[fileName]).map(function(e) {
            return +e;
        });
        if (Utils.checkArray(chunks)) {
            files.push(fileName);
        }
    }
    return files;
}

module.exports.createCatalog = function() {
    return new Catalog();
}