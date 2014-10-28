/*
 nookfs
 Copyright (c) 2014 Yaroslav Gaponov <yaroslav.gaponov@gmail.com>
*/
var util = require('util');
var events = require('events');
var dgram = require('dgram');
var stream = require('stream');

var Listener = function(entryPoint) {
    if (this instanceof Listener) {
        stream.Readable.call(this, {
            objectMode: true
        });
        this.entryPoint = entryPoint;
        this.server = null;
    } else {
        return new Listener(entryPoint);
    }
}

util.inherits(Listener, stream.Readable);

Listener.prototype._read = function() {

}

Listener.prototype.start = function(done) {
    var self = this;
    if (!this.server) {
        this.server = dgram.createSocket(this.entryPoint.protocol);
        self.server.on('message', function(data) {
            self.push(JSON.parse(data));
        });
        self.server.on('listening', function() {
            self.server.addMembership(self.entryPoint.host);
            self.server.setMulticastTTL(self.entryPoint.ttl);
            if (done && typeof done === 'function') {
                done();
            }
        });
        this.server.bind(self.entryPoint.port, self.entryPoint.host);
    }
    return this;
}

Listener.prototype.stop = function(done) {
    if (this.server) {
        this.server.close();
        this.server = null;
        this.end();
        if (done && typeof done === 'function') {
            done();
        }
    }
    return this;
}


var createListener = module.exports.createListener = function(entryPoint) {
    return new Listener(entryPoint);
}


/*
createListener({
    "protocol": "udp4",
    "host": "224.2.2.4",
    "port": 7878,
    "ttl": 3
  })
    .on('data', function(data) { console.log(data); })
    .start()
;
*/