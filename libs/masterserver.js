/*
 nookfs
 Copyright (c) 2014 Yaroslav Gaponov <yaroslav.gaponov@gmail.com>
*/
var Server = require('./server');
var Client = require('./client');
var Informer = require('./informer');
var Listener = require('./listener');
var Settings = require('./settings');
var Catalog = require('./catalog');
var Utils = require('./utils');
var Logger = require('./logger');

var logger = Logger('MasterServer', Settings.LOG_LEVEL);

var MasterServer = function() {
    var self = this;

    if (this instanceof MasterServer) {

        this.masterServerID = Utils.getRandomID();

        this.chunkServers = {};

        this.catalog = Catalog.createCatalog();

        this.informer = Informer.createInformer(Settings.BROADCAST_SERVER);

        this.listener = Listener.createListener(Settings.BROADCAST_SERVER);
        this.listener.on('data', function(message) {
            switch (message.type) {
                case 'CHUNK_SERVER_REGISTER':
                    if (!self.chunkServers[message.chunkServerID]) {
                        logger.debug('Register a new ChunkServer [%s]', message.chunkServerID);
                        self.chunkServers[message.chunkServerID] = Client.createClient(message.entryPoint)
                            .on('end', function() {
                                if (self.chunkServers[message.chunkServerID]) {
                                    logger.debug('Unregister ChunkServer [%s]', message.chunkServerID);
                                    self.chunkServers[message.chunkServerID].end();
                                    delete self.chunkServers[message.chunkServerID];
                                    self.catalog.reset(message.chunkServerID);
                                }                                
                            })
                            .request({
                                    'type': 'CATALOG',
                                    'masterServerID': self.masterServerID
                                },
                                function(message) {
                                    self.catalog.reset(message.chunkServerID);
                                    for (var fileName in message.catalog) {
                                        message.catalog[fileName].forEach(function(chunkNumber) {
                                            self.catalog.add(fileName, chunkNumber, message.chunkServerID);
                                        });
                                    }
                                }
                            )
                    }
                    break;
                case 'CHUNK_SERVER_UNREGISTER':
                    if (self.chunkServers[message.chunkServerID]) {
                        logger.debug('Unregister ChunkServer [%s]', message.chunkServerID);
                        self.chunkServers[message.chunkServerID].end();
                        delete self.chunkServers[message.chunkServerID];
                        self.catalog.reset(message.chunkServerID);
                    }
                    break;
                case 'CHUNK_SERVER_CATALOG_CHANGED':
                    switch (message.op) {
                        case 'upload':
                            self.catalog.add(message.fileName, message.chunkNumber, message.chunkServerID);
                            break;
                        case 'remove':
                            self.catalog.remove(message.fileName, message.chunkNumber, message.chunkServerID);
                            break;
                    }
                    break;
                case 'SEARCH_MASTER_SERVERS':
                    logger.debug('Send information about MasterService to client.');
                    self.informer.write({
                        type: 'MASTER_SERVER_REGISTER',
                        masterServerID: self.masterServerID,
                        entryPoint: self.server.getEntryPoint()
                    });
                    break;
            }
        });

        this.server = Server.createServer(Utils.getEntryPoint(Settings.UNICAST_SERVER));
        this.server.onMessage(function(message, reply) {
            switch (message.type) {

                case 'UPLOAD_CHUNK':
                    logger.debug('Proxy upload file [%s] chunk [%s] from client to ChunkServer.', message.fileName, message.chunkNumber);
                    var chunkServerID = Utils.getRandomKey(self.chunkServers);
                    self.chunkServers[chunkServerID].request(message, reply);
                    break;

                case 'CATALOG':
                    logger.debug('Sending information about files to client.');
                    reply(self.catalog.getFiles());
                    break;

                case 'DOWNLOAD_FILE':
                    logger.debug('Downloading file [%s] from ChunkServers to client.', message.fileName);
                    var tasks = [];
                    var chunks = self.catalog.getChunkServers(message.fileName);
                    for (var chunkNumber in chunks) {
                        tasks.push({
                            'chunkServerID': chunks[chunkNumber][Utils.getRandomNumber(chunks[chunkNumber].length)],
                            'fileName': message.fileName,
                            'chunkNumber': chunkNumber
                        });
                    }
                    Utils.coherently(
                        tasks,
                        function(task, done) {
                            self.chunkServers[task.chunkServerID].request({
                                    'type': 'DOWNLOAD_CHUNK',
                                    'fileName': task.fileName,
                                    'chunkNumber': task.chunkNumber
                                },
                                function(result) {                                    
                                    reply(result);
                                    done();
                                }
                            );
                        },
                        function() {
                            reply({
                                'type': 'DOWNLOAD_FILE_END'
                            });
                        }
                    );
                    break;

                case 'REMOVE_FILE':
                    logger.debug('Removing file [%s] from ChunkServers.', message.fileName);
                    var tasks = [];
                    var chunks = self.catalog.getChunkServers(message.fileName);
                    for (var chunkNumber in chunks) {
                        (function(chunkNumber) {
                            chunks[chunkNumber].forEach(function(chunkServerID) {
                                tasks.push({
                                    'chunkServerID': chunkServerID,
                                    'fileName': message.fileName,
                                    'chunkNumber': chunkNumber
                                });
                            })
                        })(chunkNumber);
                    }
                    var results = [];
                    Utils.parallel(
                        tasks,
                        function(task, done) {
                            self.chunkServers[task.chunkServerID].request({
                                    'type': 'REMOVE_CHUNK',
                                    'fileName': task.fileName,
                                    'chunkNumber': task.chunkNumber
                                },
                                function(result) {
                                    results.push(result);
                                    done();
                                }
                            );
                        },
                        function() {
                            reply(results);
                        }
                    );
                    break;

            }
        });
    } else {
        return new MasterServer();
    }
}

MasterServer.prototype.start = function() {
    var self = this;
    this.listener.start();
    this.server.start(function() {
        logger.info('Server [%s] is started %j.', self.masterServerID, self.server.getEntryPoint());
        self.informer.write({
            type: 'MASTER_SERVER_REGISTER',
            masterServerID: self.masterServerID,
            entryPoint: self.server.getEntryPoint()
        });
    });
}


MasterServer.prototype.stop = function() {
    var self = this;
    this.listener.stop();
    this.server.stop(function() {
        logger.info('Server [%s] is stopped.', self.masterServerID);
        self.informer.write({
            type: 'MASTER_SERVER_UNREGISTER',
            masterServerID: self.masterServerID,
        });
    });
}

module.exports = MasterServer;

/*
MasterServer().start();
*/