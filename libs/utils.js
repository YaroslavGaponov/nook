/*
 nookfs
 Copyright (c) 2014 Yaroslav Gaponov <yaroslav.gaponov@gmail.com>
*/
var os = require('os');

module.exports.getRandomID = function(length) {
    var abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return Array.apply(null, Array(length || 16))
        .map(function() {
            return abc[Math.floor(Math.random() * abc.length)]
        })
        .join('');
}

module.exports.getRandomNumber = function(length) {
    return Math.floor(Math.random() * length);
}

module.exports.getRandomKey = function(data) {
    var number = Math.floor(Math.random() * (1 + Object.keys(data)
        .length));
    for (key in data) {
        if (--number === 0) {
            return key;
        }
    }
    return key;
}

module.exports.getEntryPoint = function(setting) {
    var interfaces = os.networkInterfaces();
    for (var i = 0; i < setting.device.length; i++) {
        if (interfaces[setting.device[i]]) {
            var addrs = interfaces[setting.device[i]]
                .filter(function(e) {
                    return e.family === setting.family
                })
                .map(function(e) {
                    return e.address
                });
            if (addrs.length > 0) {
                return {
                    protocol: setting.family === 'IPv4' ? 'tcp4' : 'tcp6',
                    host: addrs[0]
                }
            }
        }
    }
    return {
        protocol: 'tcp4',
        host: '127.0.0.1'
    }
}


module.exports.coherently = function(tasks, iterator, done) {

    function run() {
        if (tasks.length > 0) {
            iterator(tasks.shift(), run);
        } else {
            done();
        }
    }

    run();

}

module.exports.parallel = function(tasks, iterator, done) {
    var length = tasks.length;

    tasks.forEach(function(task) {
        iterator(task, function() {
            if (--length === 0) {
                done();
            }
        });
    });

}

module.exports.checkArray = function(arr) {

    var calc = arr.reduce(function(acc, element) {
        return acc + element;
    });

    var expected = (arr.length - 1) * (arr.length >> 1);
    if ((arr.length & 1) === 1) {
        expected += arr.length >> 1;
    }

    return calc === expected;
}