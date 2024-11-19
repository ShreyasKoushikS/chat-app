const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const users = new Map(); // stores username -> socket.id mapping

io.on('connection', (socket) => {
    let username = '';

    socket.on('login', (user) => {
        if (users.has(user)) {
            socket.emit('loginError', 'Username is already taken');
        } else {
            username = user;
            users.set(username, socket.id);
            console.log(`${username} logged in`);
        }
    });

    socket.on('startChat', (recipient) => {
        if (!users.has(recipient)) {
            socket.emit('chatError', 'User not found');
        } else {
            console.log(`${username} started chat with ${recipient}`);
        }
    });

    socket.on('message', (data) => {
        const recipientSocketId = users.get(data.to);
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('message', {
                from: username,
                text: data.text
            });
        } else {
            socket.emit('userOffline');
        }
    });

    socket.on('disconnect', () => {
        if (username) {
            console.log(`${username} disconnected`);
            users.delete(username);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});