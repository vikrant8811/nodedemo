
// Load required libs
var config = require('./config.js');
var io = require('socket.io')(config.port);
var http = require('http');
var url = require('url');
var request = require('request');
var redis_lib = require('redis');
var	redis = redis_lib.createClient(config.redis.port, config.redis.host);
var path = require('path');
var home_path = path.dirname(process.mainModule.filename) + '/';

// Create needed variables
var friends = {};
var thread = {};

var PF = {
	config: {},

	event: {
		hooks: {},

		on: function (name, callback) {
			if (typeof(this.hooks[name]) == 'undefined') {
				this.hooks[name] = [];
			}
			this.hooks[name].push(callback);
		},

		trigger: function (name, params) {
			if (typeof(this.hooks[name]) == 'object') {
				for (var i in this.hooks[name]) {
					this.hooks[name][i](params);
				}
			}
		}
	}
};

PF.config = config;

// Load any custom hooks
require('fs').readdirSync(home_path + 'hooks/').forEach(function(file) {
	require(home_path + 'hooks/' + file)(PF);
});

// Start the connection
io.on('connection', function (socket) {
	var host = socket.handshake.headers.origin;

	PF.event.trigger('socket_connection', {
		socket: socket,
		redis: redis
	});

	// When a user joins a room
	socket.on('join', function(user) {
		friends[user.id] = user;

		socket.broadcast.emit('addToRoom', friends);
		socket.emit('addToRoom', friends);
	});

	// Hide a thread
	socket.on('hideThread', function(data) {
		// console.log(data);
		redis.set(['thread:hide:' + data.id + ':' + data.user_id, 1]);
	});

	socket.on('deleteUser', function(user_id) {
		redis.del(['user/' + user_id]);
	});

	// Load all threads
	socket.on('loadThreads', function(user_id) {
		redis.get('im:host:failed:' + host, function(err, failed) {
			if (failed) {
				console.log('host failed');
				return;
			}

			console.log('loading threads for: ' + user_id);

			redis.lrange(['threads:' + user_id, 0, 1000], function (err, threads) {
				socket.emit('total_threads', threads.length);

				for (var i in threads) {
					console.log('thread:' + 'thread:' + threads[i]);
					redis.get('thread:' + threads[i], function (err, thread) {
						thread = JSON.parse(thread);

						redis.get('new:message:' + thread.thread_id + ':' + user_id, function (err, is_new) {
							thread.is_new = is_new;
							redis.get('thread:hide:' + thread.thread_id + ':' + user_id, function (err, is_hidden) {
								thread.is_hidden = is_hidden;
								socket.emit('loadThreads', JSON.stringify(thread));
							});
						});
					});
				}
			});
		});
	});

	socket.on('loadConversation', function(conversation) {
		redis.get('thread:' + conversation.thread_id, function(err, thread) {
			if (thread === null) {
				return;
			}

			thread = JSON.parse(thread);

			redis.del('new:message:' + thread.thread_id + ':' + conversation.user_id);
			redis.zrange(['message:' + thread.thread_id, 0, -1], function(e, messages) {
				socket.emit('loadConversation', messages);
			});
		});
	});

	// Delete a message
	socket.on('chat_delete', function(id, key) {
		redis.zremrangebyscore(['message:' + id, '-inf', '(' + key], function(err, result) {
			socket.broadcast.emit('chat_delete', key);
		});
	});

	// Add a new message to the thread
	socket.on('chat', function(chat) {
		var add_chat = function(thread, chat) {
			thread.preview = chat.text;
			thread.updated = chat.time_stamp;
			redis.set(['thread:' + chat.thread_id, JSON.stringify(thread)]);

			redis.zadd(['message:' + chat.thread_id + '', chat.time_stamp, JSON.stringify(chat)], function(err, result) {
				var users = chat.thread_id.split(':');
				for (var i in users) {
					var u = users[i];

					if (u != chat.user.id) {
						redis.set(['new:message:' + chat.thread_id + ':' + u, 1]);
					}

					redis.lrem(['threads:' + u, 0, chat.thread_id], function(err, result) {

					});

					redis.lpush(['threads:' + u, chat.thread_id], function(err, result) {

					});

					redis.del('thread:hide:' + chat.thread_id + ':' + u);
				}

				socket.broadcast.emit('chat', chat);
			});
		};

			redis.get('thread:' + chat.thread_id, function(err, thread) {
				if (thread === null) {
					var users = chat.thread_id.split(':');

					var thread = {
						thread_id: chat.thread_id,
						listing_id: chat.listing_id,
						created: chat.time_stamp,
						users: users,
						preview: null,
						updated: null
					};

					redis.set(['thread:' + chat.thread_id, JSON.stringify(thread)], function(err, result) {
						add_chat(thread, chat);
					});
				}
				else {
					add_chat(JSON.parse(thread), chat);
				}
			});
	});
});