/*
 nookfs
 Copyright (c) 2014 Yaroslav Gaponov <yaroslav.gaponov@gmail.com>
*/
var Informer = require('./informer');
var Settings = require('./settings');
var Server = require('./server');
var Listener = require('./listener');
var Utils = require('./utils');
var Storage = require('./storage');
var Logger = require('./logger');
var Cache = require('./cache');

var fs = require('fs');
var path  = require('path');
var util = require('util');

var logger = Logger('ChunkServer', Settings.LOG_LEVEL);

var ChunkServer = function(chunkServerID) {
    var self = this;

    if (this instanceof ChunkServer) {
        
        this.cache = new Cache(Settings.CACHE_LIMIT, Settings.CACHE_INTERVAL);
        
        this.chunkServerID = chunkServerID;
        
        var dir = path.join(process.env.HOME, '.nook');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        this.storage = Storage.createStorage(dir, chunkServerID);

        this.listener = Listener.createListener(Settings.BROADCAST_SERVER);
        this.listener.on('data', function(message) {
            switch (message.type) {
                case 'MASTER_SERVER_REGISTER':
                    logger.debug('Sending register message to MasterService [%s].', message.masterServerID);
                    self.informer.write({
                        'type': 'CHUNK_SERVER_REGISTER',
                        'chunkServerID': self.chunkServerID,
                        'entryPoint': self.server.getEntryPoint()
                    });
                    break;
            }
        });

        this.informer = Informer.createInformer(Settings.BROADCAST_SERVER);
        this.server = Server.createServer(Utils.getEntryPoint(Settings.UNICAST_SERVER))
        this.server.onMessage(
            function(message, reply) {
                switch (message.type) {
                    case 'CATALOG':
                        logger.debug('Sending information about catalog to MasterServer [%s].', message.masterServerID);
                        reply({
                            'chunkServerID': self.chunkServerID,
                            'catalog': self.storage.getCatalog()
                        });
                        break;
                    case 'UPLOAD_CHUNK':
                        logger.debug('Uploading file [%s] chunk [%s]', message.fileName, message.chunkNumber);
                        self.storage.save(message.fileName, message.chunkNumber, new Buffer(message.chunk), function(error) {
                            reply({
                                'type': 'UPLOAD_CHUNK_END',
                                'chunkServerID': self.chunkServerID,
                                'error': error
                            });
                            if (!error) {
                                self.cache.set(util.format('%s:%s',message.fileName, message.chunkNumber), message.chunk);
                                self.informer.write({
                                    'type': 'CHUNK_SERVER_CATALOG_CHANGED',
                                    'chunkServerID': self.chunkServerID,
                                    'op': 'upload',
                                    'fileName': message.fileName,
                                    'chunkNumber': message.chunkNumber
                                });
                            }
                        });
                        break;
                    case 'DOWNLOAD_CHUNK':
                        logger.debug('Downloading file [%s] chunk [%s].', message.fileName, message.chunkNumber);
                        if (self.cache.exists(util.format('%s:%s', message.fileName, message.chunkNumber))) {
                            reply({
                                'type': 'DOWNLOAD_CHUNK_END',
                                'chunkServerID': self.chunkServerID,
                                'error': null,
                                'fileName': message.fileName,
                                'chunkNumber': message.chunkNumber,
                                'chunk': self.cache.get(util.format('%s:%s', message.fileName, message.chunkNumber))
                            });                            
                        } else {
                            self.storage.load(message.fileName, message.chunkNumber, function(error, data) {
                                reply({
                                    'type': 'DOWNLOAD_CHUNK_END',
                                    'chunkServerID': self.chunkServerID,
                                    'error': error,
                                    'fileName': message.fileName,
                                    'chunkNumber': message.chunkNumber,
                                    'chunk': data ? data.toJSON() : ''
                                });
                            });
                        }
                        break;
                    case 'REMOVE_CHUNK':
                        logger.debug('Removing file [%s] chunk [%s].', message.fileName, message.chunkNumber);
                        self.storage.remove(message.fileName, message.chunkNumber, function(error) {
                            reply({
                                'chunkServerID': self.chunkServerID,
                                'fileName': message.fileName,
                                'chunkNumber': message.chunkNumber,
                                'error': error
                            });
                            if (!error) {
                                self.cache.remove(util.format('%s:%s',message.fileName, message.chunkNumber));
                                self.informer.write({
                                    'type': 'CHUNK_SERVER_CATALOG_CHANGED',
                                    'chunkServerID': self.chunkServerID,
                                    'op': 'remove',
                                    'fileName': message.fileName,
                                    'chunkNumber': message.chunkNumber
                                });
                            }
                        });
                        break;
                }
            }
        );
    } else {
        return new ChunkServer(chunkServerID);
    }
}

ChunkServer.prototype.start = function() {
    var self = this;
    this.listener.start();
    this.server.start(function() {
        logger.info('Server [%s] is started %j.', self.chunkServerID, self.server.getEntryPoint());
        self.informer.write({
            'type': 'CHUNK_SERVER_REGISTER',
            'chunkServerID': self.chunkServerID,
            'entryPoint': self.server.getEntryPoint()
        });
    });

}

ChunkServer.prototype.stop = function() {
    var self = this;
    this.listener.stop();
    this.server.stop(function() {
        logger.info('Server [%s] is stopped.', self.chunkServerID);
        self.informer.write({
            'type': 'CHUNK_SERVER_UNREGISTER',
            'chunkServerID': self.chunkServerID
        });
    });
}


module.exports = ChunkServer;

/*
ChunkServer('node1').start();
*/