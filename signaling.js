const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors({ 
  origin: process.env.CORS_ORIGIN || '*', 
  methods: ['GET', 'POST'] 
}));

const server = http.createServer(app);

// Fixed: Using new Server() initialization instead of deprecated socketIo()
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling']
});

const rooms = new Map();

io.on('connection', (socket) => {
  console.log('✓ User connected:', socket.id);

  socket.on('join-room', (roomId) => {
    console.log(`→ User ${socket.id} joining room: ${roomId}`);

    const room = rooms.get(roomId) || [];

    if (room.length >= 2) {
      console.log(`✗ Room ${roomId} is full`);
      socket.emit('room-full');
      return;
    }

    socket.join(roomId);
    room.push(socket.id);
    rooms.set(roomId, room);

    socket.emit('joined-room', roomId);
    console.log(`✓ User ${socket.id} joined room ${roomId}`);

    if (room.length === 2) {
      const otherUser = room.find((id) => id !== socket.id);
      console.log(`✓ Room ${roomId} now has 2 users. Notifying both peers.`);
      
      // Notify the existing user that someone joined
      socket.to(otherUser).emit('user-joined', socket.id);
      
      // Tell the new user about the existing user
      socket.emit('other-user', otherUser);
    }

    console.log(`ℹ Room ${roomId} now has ${room.length} user(s)`);
  });

  socket.on('offer', ({ offer, to }) => {
    console.log(`→ Forwarding offer from ${socket.id} to ${to}`);
    socket.to(to).emit('offer', { offer, from: socket.id });
  });

  socket.on('answer', ({ answer, to }) => {
    console.log(`→ Forwarding answer from ${socket.id} to ${to}`);
    socket.to(to).emit('answer', { answer, from: socket.id });
  });

  socket.on('ice-candidate', ({ candidate, to }) => {
    console.log(`→ Forwarding ICE candidate from ${socket.id} to ${to}`);
    socket.to(to).emit('ice-candidate', { candidate, from: socket.id });
  });

  socket.on('leave-room', (roomId) => {
    console.log(`← User ${socket.id} leaving room ${roomId}`);
    handleUserLeaving(socket, roomId);
  });

  socket.on('disconnect', () => {
    console.log('✗ User disconnected:', socket.id);

    rooms.forEach((users, roomId) => {
      const index = users.indexOf(socket.id);
      if (index !== -1) {
        handleUserLeaving(socket, roomId);
      }
    });
  });
});

function handleUserLeaving(socket, roomId) {
  const room = rooms.get(roomId);
  if (room) {
    const index = room.indexOf(socket.id);
    if (index !== -1) {
      room.splice(index, 1);

      // Notify other users in the room
      room.forEach((userId) => {
        io.to(userId).emit('user-left');
        console.log(`→ Notified ${userId} that ${socket.id} left`);
      });

      if (room.length === 0) {
        rooms.delete(roomId);
        console.log(`✗ Room ${roomId} deleted (empty)`);
      } else {
        rooms.set(roomId, room);
        console.log(`ℹ Room ${roomId} now has ${room.length} user(s)`);
      }

      socket.leave(roomId);
      console.log(`✓ User ${socket.id} successfully left room ${roomId}`);
    }
  }
}


app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    rooms: rooms.size,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3007;
server.listen(PORT, () => {
  console.log(`\n🚀 Signaling server running on port ${PORT}`);

});