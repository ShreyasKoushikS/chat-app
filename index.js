const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// Store rooms and messages
const rooms = new Map();
const roomMessages = new Map();

io.on('connection', (socket) => {
    let currentRoom = '';
    let currentUser = '';

    socket.on('login', (username) => {
        currentUser = username;
        console.log(`${username} logged in`);
    });

    socket.on('joinRoom', ({ room, username }) => {
        currentRoom = room;
        currentUser = username;
        
        socket.join(room);
        
        if (!rooms.has(room)) {
            rooms.set(room, new Set());
            roomMessages.set(room, []);
        }
        
        rooms.get(room).add(username);
        
        // Send previous messages
        const messages = roomMessages.get(room);
        socket.emit('previousMessages', messages);
        
        // System message for join
        const joinMessage = {
            type: 'system',
            content: `${username} joined the room`,
            timestamp: new Date().toISOString()
        };
        roomMessages.get(room).push(joinMessage);
        io.to(room).emit('systemMessage', joinMessage.content);
        
        io.to(room).emit('userCount', {
            room: room,
            count: rooms.get(room).size
        });

        console.log(`${username} joined room ${room}`);
    });

    socket.on('chatMessage', (data) => {
        const messageData = {
            type: 'message',
            username: data.username,
            content: data.message,
            timestamp: new Date().toISOString()
        };
        
        roomMessages.get(data.room).push(messageData);
        
        io.to(data.room).emit('message', {
            username: data.username,
            message: data.message,
            timestamp: messageData.timestamp
        });
    });

    socket.on('disconnect', () => {
        if (currentRoom && currentUser) {
            if (rooms.has(currentRoom)) {
                rooms.get(currentRoom).delete(currentUser);
                
                const leaveMessage = {
                    type: 'system',
                    content: `${currentUser} left the room`,
                    timestamp: new Date().toISOString()
                };
                roomMessages.get(currentRoom).push(leaveMessage);
                
                if (rooms.get(currentRoom).size === 0) {
                    rooms.delete(currentRoom);
                } else {
                    io.to(currentRoom).emit('systemMessage', leaveMessage.content);
                    io.to(currentRoom).emit('userCount', {
                        room: currentRoom,
                        count: rooms.get(currentRoom).size
                    });
                }
            }
            console.log(`${currentUser} left room ${currentRoom}`);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});