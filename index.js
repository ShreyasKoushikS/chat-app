const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// Store rooms and messages
const rooms = new Map();
const roomMessages = new Map();
const roomPasswords = new Map();

io.on('connection', (socket) => {
    let currentUser = '';
    let currentRoom = '';

    // Handle user login
    socket.on('login', (username) => {
        currentUser = username;
        console.log(`User logged in: ${username}`);
        // Send initial room list
        sendRoomList();
    });

    // Send room list to all clients
    function sendRoomList() {
        const roomList = Array.from(rooms.keys()).map(room => ({
            name: room,
            userCount: rooms.get(room).size,
            isProtected: roomPasswords.has(room)
        }));
        io.emit('roomList', roomList);
        console.log('Room list sent:', roomList);
    }

    // Create new room
    socket.on('createRoom', async (data) => {
        console.log('Create room request:', data);
        const { roomName, password } = data;

        if (!rooms.has(roomName)) {
            // Create new room
            rooms.set(roomName, new Set());
            roomMessages.set(roomName, []);

            // If password provided, hash and store it
            if (password) {
                const hashedPassword = await bcrypt.hash(password, 10);
                roomPasswords.set(roomName, hashedPassword);
            }

            console.log(`Room created: ${roomName}`);
            sendRoomList();
        } else {
            socket.emit('error', 'Room already exists');
        }
    });

    // Join room
    socket.on('joinRoom', async (data) => {
        const { room, username, password } = data;
        console.log(`Join room request: ${username} -> ${room}`);

        // Check if room exists
        if (!rooms.has(room)) {
            socket.emit('error', 'Room does not exist');
            return;
        }

        // Check password if room is protected
        if (roomPasswords.has(room)) {
            if (!password) {
                socket.emit('passwordRequired');
                return;
            }
            const isValid = await bcrypt.compare(password, roomPasswords.get(room));
            if (!isValid) {
                socket.emit('error', 'Incorrect password');
                return;
            }
        }

        // Leave current room if any
        if (currentRoom) {
            socket.leave(currentRoom);
            rooms.get(currentRoom).delete(currentUser);
        }

        // Join new room
        socket.join(room);
        rooms.get(room).add(username);
        currentRoom = room;
        currentUser = username;

        // Send previous messages
        socket.emit('previousMessages', roomMessages.get(room));

        // Notify room about new user
        const joinMessage = `${username} joined the room`;
        roomMessages.get(room).push({ type: 'system', content: joinMessage });
        io.to(room).emit('systemMessage', joinMessage);

        // Send updated room list
        sendRoomList();
        
        // Confirm successful join
        socket.emit('joinSuccess', room);
    });

    // Handle chat messages
    socket.on('chatMessage', (data) => {
        console.log('Chat message:', data);
        if (currentRoom) {
            const messageData = {
                type: 'message',
                username: currentUser,
                content: data.message
            };
            roomMessages.get(currentRoom).push(messageData);
            io.to(currentRoom).emit('message', {
                username: currentUser,
                message: data.message
            });
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        if (currentRoom && currentUser) {
            rooms.get(currentRoom).delete(currentUser);
            const leaveMessage = `${currentUser} left the room`;
            roomMessages.get(currentRoom).push({ type: 'system', content: leaveMessage });
            io.to(currentRoom).emit('systemMessage', leaveMessage);
            sendRoomList();
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});