"use strict"

var http = require('http');

module.exports = function(PF) {
	if (typeof(PF.config.is_hosted) == 'boolean' && PF.config.is_hosted) {
		console.log('Is Hosted');

		PF.event.on('socket_connection', function (params) {
			var host = params.socket.handshake.headers.origin;
			params.socket.on('host', function (token) {
				params.redis.get('im/host/access/token/' + token.token, function (err, result) {
					if (!result) {
						console.log('hosting failed...');
						console.log(token);
						console.log(result);

						params.redis.set(['im:host:failed:' + host, 1]);
						params.socket.emit('host_failed', {});
					}
				});
			});
		});
	}
};