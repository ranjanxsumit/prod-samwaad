require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');
const { socketHandler } = require('./sockets');

const app = express();

// Support multiple allowed client origins via CLIENT_URLS (comma-separated) or CLIENT_URL single value.
// This lets us accept requests from different dev servers (e.g., Vite preview on :4173 and dev on :3001)
const rawClientUrls = process.env.CLIENT_URLS || process.env.CLIENT_URL || '';
const allowedOrigins = rawClientUrls.split(',').map(s => s.trim()).filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // allow requests with no origin (e.g., curl, server-to-server)
    if (!origin) return callback(null, true)
    if (allowedOrigins.length === 0) return callback(null, true) // no restriction configured
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.indexOf('*') !== -1) return callback(null, true)
    return callback(new Error('Not allowed by CORS'))
  },
  credentials: true,
}

app.use(cors(corsOptions));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: allowedOrigins.length ? allowedOrigins : '*' } });

socketHandler(io);

const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Connected to MongoDB');
    server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
  })
  .catch(err => {
    console.error('MongoDB connection error', err);
    process.exit(1);
  });
