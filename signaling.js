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
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
});

const rooms = new Map();

io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  socket.on('join-room', (roomId) => {
    console.log(`📞 User ${socket.id} joining room: ${roomId}`);

    const room = rooms.get(roomId) || [];

    if (room.length >= 2) {
      socket.emit('room-full');
      return;
    }

    socket.join(roomId);
    room.push(socket.id);
    rooms.set(roomId, room);

    socket.emit('joined-room', roomId);

    if (room.length === 2) {
      const otherUser = room.find((id) => id !== socket.id);
      socket.to(otherUser).emit('user-joined', socket.id);
      socket.emit('other-user', otherUser);
    }
  });

  socket.on('offer', ({ offer, to }) => {
    console.log(`📤 Forwarding offer from ${socket.id} to ${to}`);
    socket.to(to).emit('offer', { offer, from: socket.id });
  });

  socket.on('answer', ({ answer, to }) => {
    console.log(`📥 Forwarding answer from ${socket.id} to ${to}`);
    socket.to(to).emit('answer', { answer, from: socket.id });
  });

  socket.on('ice-candidate', ({ candidate, to }) => {
    socket.to(to).emit('ice-candidate', { candidate, from: socket.id });
  });

  socket.on('leave-room', (roomId) => {
    handleUserLeaving(socket, roomId);
  });

  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);

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

      
      room.forEach((userId) => {
        io.to(userId).emit('user-left');
      });

      if (room.length === 0) {
        rooms.delete(roomId);
        console.log(`🗑️  Room ${roomId} deleted`);
      } else {
        rooms.set(roomId, room);
      }

      socket.leave(roomId);
    }
  }
}

const PORT = process.env.PORT || 3007;
server.listen(PORT, () => {
  console.log(`🚀 Signaling server running on port ${PORT}`);
});