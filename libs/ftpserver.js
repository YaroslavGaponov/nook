/*
 nookfs
 Copyright (c) 2014 Yaroslav Gaponov <yaroslav.gaponov@gmail.com>
*/
var net = require('net');
var util = require('util');
var stream = require('stream');
var path = require('path');
var Logger = require('./logger');
var Settings = require('./settings');
var Utils = require('./utils');
var API = require('./api');

var logger = Logger('FtpServer', Settings.LOG_LEVEL);

var DELIMETER = '\r\n';

var Mode = {
    'UNKNOWN': 'UNKNOWN',
    'ACTIVE': 'ACTIVE',
    'PASSIVE': 'PASSIVE'
}

var Type = {
    'A': 'ascii',
    'I': 'binary'
}

var AppServer = function(duplex) {
    if (this instanceof AppServer) {
        var self = this;

        this.duplex = duplex;
        this.duplex.pause();

        this.welcome();

        this.mode = Mode.UNKNOWN;
        this.type = Type.A;

        this.server = null;
        this.host = null;
        this.port = null;

        this.socket = null;

        this.client = new API();
        this.client.once('connected', function() {
            logger.info('Client is connected.');

            self.duplex.resume();

            self.duplex.on('data', function(chunk) {
                self.duplex.pause();

                var args = chunk.toString().split(DELIMETER)[0].split(' ').filter(Boolean);
                var cmd = args.shift().trim();

                if (cmd in self) {
                    logger.debug('ftp command is [', cmd, '] - ', args);
                    self[cmd].apply(self, args);
                } else {
                    logger.debug('Command [%s] is not implemented', cmd);
                    self.reply(202, 'Command not implemented.');
                }


                if (cmd !== 'PASV') {
                    self.duplex.resume();
                }
            })
        });
        this.client.once('disconnected', function() {
            logger.info('Client is disconnected.');
        });


    } else {
        return new AppServer(duplex);
    }
}


AppServer.prototype.start = function() {
    this.client.connect();
}


AppServer.prototype.stop = function() {
    this.client.disconnect();
}

AppServer.prototype.reply = function(code, message) {
    var self = this;
    var answer = util.format('%s %s', code, message || '');
    this.duplex.write(answer + DELIMETER);
    logger.debug(answer);
}

AppServer.prototype.welcome = function() {
    this.reply(220, 'FTP server ready');
}

AppServer.prototype.USER = function(userName) {
    this.reply(331, 'User name okay, need password.');
}

AppServer.prototype.PASS = function(password) {
    this.reply(230, 'User logged in, proceed.');
}

AppServer.prototype.PWD = function() {
    this.reply(257, '"/"');
}

AppServer.prototype.SYST = function() {
    this.reply(215, 'UNIX Type: L8');
}

AppServer.prototype.TYPE = function(type) {
    switch (type.trim()) {
        case 'A':
            this.type = Type.A;
            this.reply(200, 'Switching to ASCII mode.');
            break;
        case 'I':
            this.type = Type.I;
            this.reply(200, 'Switching to Binary mode.');
            break;
    }
}

AppServer.prototype.PASV = function() {
    var self = this;

    if (this.socket) {
        this.socket.end();
        this.socket = null;
    }

    this.mode = Mode.PASSIVE;

    function replyEntryPoint() {
        var i1 = parseInt(self.port / 256);
        var i2 = parseInt(self.port % 256);
        self.reply(227, 'Entering Passive Mode (' + self.host.split('.').join(',') + ',' + i1 + ',' + i2 + ').');

        setTimeout(function() {
            self.duplex.resume();
        }, 10)
    }

    if (this.server) {
        replyEntryPoint();
    } else {
        this.server = net.createServer(function(socket) {
            socket.pause();
            socket.setEncoding(self.type);
            socket.setTimeout(0);
            socket.setNoDelay();
            self.socket = socket;
            self.reply(150, 'File status okay; about to open data connection.');
        });
        this.server.listen(function() {
            self.host = Utils.getEntryPoint(Settings.UNICAST_SERVER).host;
            self.port = self.server.address().port;
            replyEntryPoint();
        });
    }
}

AppServer.prototype.PORT = function(address) {
    this.mode = Mode.ACTIVE;
    var addr = address.split(',');
    this.host = addr[0] + '.' + addr[1] + '.' + addr[2] + '.' + addr[3];
    this.port = (parseInt(addr[4]) * 256) + parseInt(addr[5]);
    this.reply(200, 'OK');
}

AppServer.prototype.LIST = function() {
    var self = this;

    if (!this.client.isConnected()) {
        return this.reply(421, 'MasterService is not found.');
    }

    switch (this.mode) {
        case Mode.UNKNOWN:
            this.reply(425, 'Use PORT or PASV first.');
            break;

        case Mode.ACTIVE:
            this.socket = net.createConnection(this.port, this.host, function() {
                self.socket.pause();
                self.socket.setEncoding(self.type);
                self.reply(150, 'File status okay; about to open data connection.');
                list(self.socket);
            });
            break;

        case Mode.PASSIVE:
            list(this.socket);
            break;
    }

    function list(socket) {
        self.client.files(function(files) {
            socket.write(
                'total ' + files.length + DELIMETER +
                files.map(function(file) {
                    return util.format('-rw-r--r--  1 500  500  0 Jun 21 08:52 %s', file);
                })
                .join(DELIMETER) + DELIMETER,
                self.type,
                function() {
                    socket.end();
                    self.mode = Mode.UNKNOWN;
                    self.reply(226, 'Closing data connection.');
                }
            );
        });
    }
}

AppServer.prototype.SIZE = function(fileName) {
    var self = this;

    if (!this.client.isConnected()) {
        return this.reply(421, 'MasterService is not found.');
    }

    this.client.files(function(files) {
        if (files.indexOf(path.basename(fileName)) === -1) {
            self.reply(213, 0);
        } else {
            self.reply(550, 'Could not get file size.');
        }
    });
}

AppServer.prototype.QUIT = function() {
    this.reply(221, 'Good bye');
}

AppServer.prototype.CWD = function(path) {
    if (!path || path === '/') {
        this.reply(250, 'Directory successfully changed.');
    } else {
        this.reply(550, 'Failed to change directory.');
    }
}

AppServer.prototype.RETR = function(fileName) {
    var self = this;

    if (!this.client.isConnected()) {
        return this.reply(421, 'MasterService is not found.');
    }

    if (!fileName || fileName === '/') {
        return this.reply(550, 'Failed to open file.');
    }

    switch (this.mode) {
        case Mode.UNKNOWN:
            this.reply(425, 'Use PORT or PASV first.');
            break;

        case Mode.ACTIVE:
            this.socket = net.createConnection(this.port, this.host, function() {
                self.socket.setEncoding(self.type);
                self.socket.pause();                
                self.reply(150, 'File status okay; about to open data connection.');
                download(self.socket);
            });
            break;

        case Mode.PASSIVE:
            download(this.socket);
            break;
    }

    function download(socket) {
        self.client.download(path.basename(fileName), socket, function(err) {
            self.mode = Mode.UNKNOWN;
            self.reply(226, 'Closing data connection.');
        })
    }
}

AppServer.prototype.STOR = function(fileName) {
    var self = this;

    if (!this.client.isConnected()) {
        return this.reply(421, 'MasterService is not found.');
    }

    switch (this.mode) {
        case Mode.UNKNOWN:
            this.reply(425, 'Use PORT or PASV first.');
            break;

        case Mode.ACTIVE:
            this.socket = net.createConnection(this.port, this.host, function() {
                self.socket.setEncoding(self.type);
                self.socket.pause();
                self.reply(150, 'File status okay; about to open data connection.');
                upload(self.socket);
            });
            break;

        case Mode.PASSIVE:
            upload(self.socket);
            break;
    }

    function upload(socket) {
        socket.on('error', function(err) {
            logger.debug(err);
        });
        self.client.upload(path.basename(fileName), socket, function(err) {
            self.mode = Mode.UNKNOWN;
            self.reply(226, 'Closing data connection.');
        })
    }
}

AppServer.prototype.DELE = function(fileName) {
    var self = this;

    if (!this.client.isConnected()) {
        return this.reply(421, 'MasterService is not found.');
    }

    this.client.remove(path.basename(fileName), function(err) {
        if (!err) {
            self.reply(250);
        } else {
            self.reply(450)
        }
    });
}

AppServer.prototype.FEAT = function() {
    this.reply('211-Features');
    this.reply(' ', 'SIZE');
    this.reply('211 end');
}

var FtpServer = function(port) {
    if (this instanceof FtpServer) {
        this.port = port || 21;
        this.server = net.createServer(function(socket) {
            logger.debug('New client ', socket.remoteAddress);

            socket.pause();
            socket.setTimeout(0);
            socket.setEncoding('ascii');
            socket.setNoDelay();

            var app = new AppServer(socket);
            socket.on('end', function() {
                app.stop();
            });
            socket.on('error', function(err) {
                logger.debug(err);
            });
            app.start();

        });
    } else {
        return new FtpServer(port);
    }
}


FtpServer.prototype.start = function(done) {
    var self = this;
    this.server.listen(this.port, function() {
        logger.info('Server is started %j', self.server.address());
        if (done && typeof done === 'function') {
            done();
        }
    });
}




FtpServer.prototype.stop = function(done) {
    logger.info('Server is stopped.');
    this.server.close(done);
}

var createFtpServer = module.exports.createFtpServer = function(port) {
    return FtpServer(port);
}

/*
var ftpServer = createFtpServer(21);
ftpServer.start();
*/