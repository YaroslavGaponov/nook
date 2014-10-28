/*
 nookfs
 Copyright (c) 2014 Yaroslav Gaponov <yaroslav.gaponov@gmail.com>
*/
var util = require('util');
var stream = require('stream');
var net = require('net');
var Utils = require('./utils');

var DELIMITER = '\n\n\n-=END=-\n\n\n';



var Client = function() {
    if (this instanceof Client) {
        stream.Duplex.call(this, {
            objectMode: true
        });
        this.callbacks = {};
        this.buffer = '';
    } else {
        return new Client();
    }
}

util.inherits(Client, stream.Duplex);

Client.prototype._write = function(data, encoding, done) {
    this.buffer += data.toString();

    var acc = this.buffer.split(DELIMITER);
    for (var i = 0; i < acc.length; i++) {
        try {
            var frame = JSON.parse(acc[i]);
            if (frame && frame.id && frame.message) {
                if (this.callbacks[frame.id]) {
                    this.callbacks[frame.id](frame.message);
                }
            }
        } catch (e) {
            this.buffer = acc.slice(i).join(DELIMITER);
        }
    }
    done();
}

Client.prototype._read = function() {

}

Client.prototype.request = function(message, done) {
    var id = Utils.getRandomID();
    this.callbacks[id] = done;
    var frame = {
        "id": id,
        "message": message
    }
    this.push(JSON.stringify(frame) + DELIMITER);
    return this;
}


var createClient = module.exports.createClient = function(entryPoint) {
    var client = new Client();
    var socket = net.connect(entryPoint);
    socket.on('error', function(error) {
        client.emit('error', error);
    });
    socket.on('end', function() {
        client.emit('end');
    });
    client.pipe(socket).pipe(client);
    return client;
}

/*
var client = createClient({
        host: '127.0.0.1',
        port: '7777'
    })
    .request({
            type: 'TIME'
        },
        function(message) {
            console.log(message);
        }
    )
    .request({
            type: 'OS'
        },
        function(message) {
            console.log(message);
        }
    );
*/