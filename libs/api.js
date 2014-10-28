/*
 nookfs
 Copyright (c) 2014 Yaroslav Gaponov <yaroslav.gaponov@gmail.com>
*/
var Informer = require('./informer');
var Listener = require('./listener');
var Client = require('./client');
var Utils = require('./utils');
var Settings = require('./settings');

var util = require('util');
var events = require('events');
var stream = require('stream');
var zlib = require('zlib');

var API = function() {
    var self = this;

    if (this instanceof API) {
        events.EventEmitter.call(this);
        this.masterServers = {};

        this.listener = Listener.createListener(Settings.BROADCAST_SERVER);
        this.listener.on('data', function(message) {
            switch (message.type) {
                case 'MASTER_SERVER_REGISTER':
                    if (!self.masterServers[message.masterServerID]) {
                        self.masterServers[message.masterServerID] = Client.createClient(message.entryPoint);
                    }
                    if (Object.keys(self.masterServers).length === 1) {
                        self.emit('connected');
                    }
                    break;
                case 'MASTER_SERVER_UNREGISTER':
                    if (self.masterServers[message.masterServerID]) {
                        delete self.masterServers[message.masterServerID];
                    }
                    break;
            }
        });

        this.informer = Informer.createInformer(Settings.BROADCAST_SERVER);

    } else {
        return new API();
    }
}

util.inherits(API, events.EventEmitter);

API.prototype.connect = function() {
    var self = this;
    this.listener.start(function() {
        self.informer.write({
            'type': 'SEARCH_MASTER_SERVERS'
        });
    });
}

API.prototype.disconnect = function() {
    this.emit('disconnected');
}


API.prototype.isConnected = function() {
    return Object.keys(this.masterServers).length > 0;
}

API.prototype._getMasterServer = function() {
    return this.masterServers[Utils.getRandomKey(this.masterServers)];
}

API.prototype.files = function(done) {
    if (!this.isConnected()) {
        return done('Error: master servers are not found yet', null);
    }
    this._getMasterServer().request({
            'type': 'CATALOG'
        },
        function(files) {
            done(files);
        }
    )

}


API.prototype.upload = function(fileName, readbleStream, done) {
    var self = this;

    if (!this.isConnected()) {
        return done(new Error('master servers are not found.'));
    }

    readbleStream.pause();    
    
    var chunkNumber = 0;
    var error = null;

    var sender = stream.Writable();
    sender._write = function(chunk, encoding, done) {
        self._getMasterServer().request({
                'type': 'UPLOAD_CHUNK',
                'fileName': fileName,
                'chunkNumber': chunkNumber++,
                'chunk': chunk.toJSON()
            },
            function(message) {
                if (message.error) {
                    error = message.error;
                }
                done();
            }
        )
    }
    sender.once('finish', function() {
        done(error);
    });


    var compressor = zlib.createDeflateRaw();
    compressor.on('readable', function() {
        readbleStream.pause();
        var chunk;
        while (null !== (chunk = compressor.read(Settings.CHUNK_LENGTH))) {
            sender.write(chunk);
        }
        readbleStream.resume();
    });
    compressor.once('end', function() {
        readbleStream.pause();
        var chunk;
        while (null !== (chunk = compressor.read(Settings.CHUNK_LENGTH))) {
            sender.write(chunk);
        }
        sender.end(compressor.read());
    });
    
    readbleStream.on('data', function(chunk) {        
        compressor.write(Buffer(chunk, 'binary'));
    });
    readbleStream.once('end', function() {
        compressor.end();
    });
    readbleStream.resume();
}

API.prototype.download = function(fileName, writableStream, done) {
    if (!this.isConnected()) {
        return done(new Error('master servers are not found.'));
    }

    var errors = false;

    var decompressor = zlib.createInflateRaw();
    decompressor.pipe(writableStream);
    decompressor.once('finish', function() {
        done(null);
    });
    this._getMasterServer().request({
            'type': 'DOWNLOAD_FILE',
            'fileName': fileName
        },
        function(message) {
            if (!errors) {
                if (message.error) {
                    errors = true;
                    done(message.error);
                } else {
                    switch (message.type) {
                        case 'DOWNLOAD_CHUNK_END':
                            decompressor.write(Buffer(message.chunk));
                            break;
                        case 'DOWNLOAD_FILE_END':
                            decompressor.end();
                            break;
                    }
                }
            }
        }
    )
}

API.prototype.remove = function(fileName, done) {
    if (!this.isConnected()) {
        return done(new Error('master servers are not found.'));
    }
    this._getMasterServer().request({
            'type': 'REMOVE_FILE',
            'fileName': fileName
        },
        function(results) {
            done(null, results);
        }
    );
}

module.exports = API;