/*
 nookfs
 Copyright (c) 2014 Yaroslav Gaponov <yaroslav.gaponov@gmail.com>
*/
var fs = require('fs');
var path = require('path');

var Storage = function(basepath) {
    var self = this;
    this.path = basepath;
    this.catalog = {};

    if (!fs.existsSync(this.path)) {
        fs.mkdirSync(this.path);
    } else {
        fs.readdirSync(this.path)
            .map(function(fileName) {
                self.catalog[fileName] = fs.readdirSync(path.join(self.path, fileName))
                    .map(function(chunk) {
                        return +chunk.split('.').pop()
                    })
            })
    }

}

Storage.prototype.getCatalog = function() {
    return this.catalog;
}

Storage.prototype.addChunk = function(fileName, chunkNumber) {
    if (!this.catalog[fileName]) {
        this.catalog[fileName] = [];
    }
    this.catalog[fileName].push(chunkNumber);
}

Storage.prototype.removeChunk = function(fileName, chunkNumber) {
    if (this.catalog[fileName]) {
        var indx = this.catalog[fileName].indexOf(+chunkNumber);
        if (indx !== -1) {
            this.catalog[fileName].splice(indx, 1);
            if (this.catalog[fileName].length === 0) {
                delete this.catalog[fileName];
            }
        }
    }
}


Storage.prototype.save = function(fileName, chunkNumber, data, callback) {
    var self = this;

    var filePath = path.join(this.path, fileName);
    if (!fs.existsSync(filePath)) {
        fs.mkdirSync(filePath);
    }

    var fullFileName = path.join(filePath, 'chunk.' + chunkNumber);
    fs.writeFile(fullFileName, data, function(err) {
        if (!err) {
            self.addChunk(fileName, chunkNumber);
        }
        callback(err);
    });
}

Storage.prototype.load = function(fileName, chunkNumber, callback) {
    var fullFileName = path.join(this.path, fileName, 'chunk.' + chunkNumber);
    fs.readFile(fullFileName, callback);
}


Storage.prototype.remove = function(fileName, chunkNumber, callback) {
    var self = this;
    var fullFileName = path.join(this.path, fileName, 'chunk.' + chunkNumber);
    fs.unlink(fullFileName, function(err) {
        if (!err) {
            self.removeChunk(fileName, chunkNumber);
            var filePath = path.join(self.path, fileName);
            fs.readdir(filePath, function(err, files) {
                if (!err && files.length === 0) {
                    fs.rmdir(filePath, function(err) {})
                }
            })
        }
        callback(err);
    });

}



module.exports.createStorage = function() {
    return new Storage(path.join.apply(null, arguments));
}