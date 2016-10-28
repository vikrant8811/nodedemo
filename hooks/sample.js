"use strict"

module.exports = function(PF) {
	PF.event.on('socket_connection', function() {
		console.log('Loading socket event...');
	});
};