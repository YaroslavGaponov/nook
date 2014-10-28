/*
 nookfs
 Copyright (c) 2014 Yaroslav Gaponov <yaroslav.gaponov@gmail.com>
*/
var util = require('util');
var events = require('events');
var dgram = require('dgram');
var stream = require('stream');

var Informer = function(entryPoint) {
    if (this instanceof Informer) {
        stream.Writable.call(this, {
            objectMode: true
        });
        this.entryPoint = entryPoint;
    } else {
        return new Informer(entryPoint);
    }
}

util.inherits(Informer, stream.Writable);


Informer.prototype._write = function(data, encoding, done) {
    var self = this;
    var socket = dgram.createSocket(this.entryPoint.protocol);
    socket.bind();
    socket.on('listening', function() {
        socket.setBroadcast(true);
        var buf = new Buffer(JSON.stringify(data));
        socket.send(buf, 0, buf.length, self.entryPoint.port, self.entryPoint.host, function(err) {
            socket.close();
            done();
        })
    })
}


var createInformer = module.exports.createInformer = function(entryPoint) {
    return new Informer(entryPoint);
}


/*
createInformer({
    "protocol": "udp4",
    "host": "224.2.2.4",
    "port": 7878,
    "ttl": 3
  }).write({ "TIME": new Date() })
;
*/