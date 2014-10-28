/*
 nookfs
 Copyright (c) 2014 Yaroslav Gaponov <yaroslav.gaponov@gmail.com>
*/
var util = require('util');
var stream = require('stream');
var net = require('net');

var DELIMITER = '\n\n\n-=END=-\n\n\n';


var AppServer = function() {
    if (this instanceof AppServer) {
        stream.Duplex.call(this, {
            objectMode: true
        });
        this.handler = function() {};
        this.buffer = '';
    } else {
        return new AppServer();
    }
}

util.inherits(AppServer, stream.Duplex);

AppServer.prototype._write = function(data, encoding, done) {
    var self = this;

    this.buffer += data.toString();
    var acc = this.buffer.split(DELIMITER);

    for (var i = 0; i < acc.length; i++) {
        try {
            var frame = JSON.parse(acc[i]);

            var reply = function(id) {
                return function(message) {
                    var frame = {
                        "id": id,
                        "message": message
                    }
                    self.push(JSON.stringify(frame) + DELIMITER);
                }
            }

            self.handler(frame.message, reply(frame.id));
        } catch (e) {
            this.buffer = acc.slice(i).join(DELIMITER);
        }
    }

    done();
}

AppServer.prototype._read = function() {

}

AppServer.prototype.onMessage = function(handler) {
    this.handler = handler;
    return this;
}

AppServer.prototype.onError = function(error) {
    
}




var Server = function(entryPoint) {
    var self = this;

    if (this instanceof Server) {
        this.entryPoint = entryPoint;
        this.handler = function() {};
        this.server = net.createServer({
                'allowHalfOpen': false
            },
            function(socket) {
                socket.setTimeout(0);
                socket.setEncoding('ascii');
                socket.setNoDelay();
                var app = new AppServer();
                app.onMessage(self.handler);
                socket.on('error', function(error) {
                    app.onError(error);
                });                
                socket.pipe(app).pipe(socket);
            }
        )
    } else {
        return new Server(entryPoint);
    }
}


Server.prototype.onMessage = function(handler) {
    this.handler = handler;
    return this;
}

Server.prototype.start = function(done) {
    var self = this;
    this.server.listen(this.entryPoint.port, this.entryPoint.host, function() {
        self.entryPoint.port = self.server.address().port;
        if (done && typeof done === 'function') {
            done();
        }
    });
    return this;
}

Server.prototype.stop = function(done) {
    this.server.close();
    if (done && typeof done === 'function') {
        done();
    }
    return this;
}

Server.prototype.getEntryPoint = function() {
    return this.entryPoint;
}


var createServer = module.exports.createServer = function(entryPoint) {
    return new Server(entryPoint);
}

/*
createServer({
        port: 7777
    })
    .onMessage(function(message, reply) {
        switch (message.type) {
            case 'TIME':
                return reply({
                    "time": new Date()
                });
            case 'OS':
                return reply({
                    "os": require('os').platform()
                });                
        }
    })
    .start(function() {
        console.log('started');
    });
*/