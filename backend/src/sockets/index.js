const jwt = require('jsonwebtoken');
const Message = require('../models/message');
const Presence = require('../models/presence');
const User = require('../models/user');

const socketHandler = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication error'));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(payload.sub);
      if (!user) return next(new Error('User not found'));
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket) => {
    const user = socket.user;
    console.log('socket connected', user.email, socket.id);

    // mark presence
    await Presence.create({ userId: user._id, socketId: socket.id, online: true });
    user.status = 'online';
    await user.save();
    io.emit('user-online', { userId: user._id.toString(), name: user.name, avatar: user.avatar });
    // emit a full online-users list to the newly connected socket so it can sync immediately
    try {
      const presences = await Presence.find({ online: true }).lean()
      const ids = Array.from(new Set(presences.map(p => p.userId.toString())))
      const users = await User.find({ _id: { $in: ids } }).select('name avatar').lean()
      const byId = users.reduce((acc, u) => { acc[u._id.toString()] = u; return acc }, {})
      const out = ids.map(id => ({ userId: id, name: byId[id]?.name || null, avatar: byId[id]?.avatar || null }))
      try { socket.emit('online-users', out) } catch (e) { /* ignore emit errors */ }
    } catch (e) {
      console.warn('failed to emit online-users on connect', e && e.message)
    }
  // join a private room for this user so we can target messages
  try { socket.join(user._id.toString()) } catch (e) { /* ignore */ }

    socket.on('send-message', async (payload = {}) => {
      // payload: { to, text, image, clientId }
      try {
        const clientId = payload.clientId || null;
        if (!payload.text && !payload.image) return; // nothing to send
        const msg = await Message.create({ from: user._id, to: payload.to, text: payload.text, image: payload.image });
        await msg.populate('from', 'name avatar');
        const out = {
          id: msg._id.toString(),
          text: msg.text,
          image: msg.image || null,
          createdAt: msg.createdAt,
          from: msg.from ? { id: msg.from._id.toString(), name: msg.from.name, avatar: msg.from.avatar } : null,
            to: msg.to ? msg.to.toString() : null,
          tempId: clientId || undefined
        };
        console.log('send-message', { from: out.from && out.from.id, to: out.to, id: out.id, clientId });
        if (payload.to) {
          // emit to recipient
          io.to(payload.to).emit('message-received', { message: out });
          // also emit unified event to sender so both sides rely on same event name
          io.to(msg.from._id.toString()).emit('message-received', { message: out });
          await Message.findByIdAndUpdate(msg._id, { delivered: true });
          io.to(msg.from._id.toString()).emit('message-delivered', { id: msg._id.toString(), deliveredAt: new Date() });
        } else {
          io.emit('message-received', { message: out });
        }
        // retain legacy ack (still sent) with correlation id so existing clients can reconcile
        socket.emit('message-sent', { message: out });
      } catch (err) {
        console.error('send-message error', err && err.message);
        socket.emit('error', { message: err.message });
      }
    });

    // mark messages as read when client notifies
    socket.on('mark-read', async (data) => {
      // data: { messageIds: [] }
      try {
        const ids = Array.isArray(data.messageIds) ? data.messageIds : [];
        if (!ids.length) return;
        await Message.updateMany({ _id: { $in: ids } }, { read: true });
        // notify original senders that messages were read
        // we can emit message-read with ids and readAt
        const readAt = new Date();
        for (const id of ids) {
          // find message to get sender
          const m = await Message.findById(id).select('from').lean();
          if (m && m.from) io.to(m.from.toString()).emit('message-read', { id, readAt });
        }
      } catch (err) {
        console.error('mark-read error', err.message)
      }
    })

    socket.on('typing', (data) => {
      // data: { to }
      socket.to(data.to).emit('typing', { from: user._id.toString() });
    });

    // helper: forward to all known socketIds for a userId; if none found, fallback to room emit
    const forwardToUserId = async (userId, event, payload) => {
      try {
        const presences = await Presence.find({ userId: userId, online: true }).lean()
        const sent = new Set()
        if (presences && presences.length) {
          const sids = []
          for (const p of presences) {
            if (p && p.socketId && !sent.has(p.socketId)) {
              try { io.to(p.socketId).emit(event, payload) } catch (e) { /* ignore per-socket emit errors */ }
              sent.add(p.socketId)
              sids.push(p.socketId)
            }
          }
          if (sids.length) console.log('forwardToUserId emitted', event, 'to socketIds', sids)
          return
        }
        // fallback: emit to room name (may be joined by sockets)
        try { io.to(String(userId)).emit(event, payload) } catch (e) { /* ignore */ }
      } catch (err) {
        console.error('forwardToUserId error', err && err.message)
      }
    }

    // helper: emit to a target which may be a socketId or a userId
    const emitToTarget = async (target, event, payload) => {
      try {
        // if target matches a known socketId, emit directly
        const bySocket = await Presence.findOne({ socketId: target }).lean()
        if (bySocket && bySocket.socketId) {
          try { io.to(target).emit(event, payload); return } catch (e) { /* ignore */ }
        }
        // otherwise treat as userId and forward
        await forwardToUserId(target, event, payload)
      } catch (err) { console.error('emitToTarget error', err && err.message) }
    }

    // call lifecycle signaling helpers
    socket.on('call-init', async (data) => {
      // data: { to, mode }
      try {
        const normalizeAvatar = (v) => {
          try {
            if (!v) return null
            if (typeof v === 'string') return v
            if (typeof v === 'object') {
              if (v.url) return v.url
              if (v.secure_url) return v.secure_url
              if (v.avatar) {
                if (typeof v.avatar === 'string') return v.avatar
                if (v.avatar && v.avatar.url) return v.avatar.url
                if (v.avatar && v.avatar.secure_url) return v.avatar.secure_url
              }
            }
          } catch (e) { /* ignore */ }
          return null
        }
        const payload = { from: user._id.toString(), name: user.name, avatar: normalizeAvatar(user.avatar), mode: data.mode || 'video', socketId: socket.id }
        await forwardToUserId(String(data.to), 'incoming-call', payload)
        console.log('call-init forwarded from', user._id.toString(), 'to', data.to, 'socket', socket.id)
      } catch (e) { console.error('call-init err', e && e.message) }
    })

    socket.on('call-accept', async (data) => {
      // data: { to }
      try {
        const payload = { from: user._id.toString(), socketId: socket.id }
        await emitToTarget(data.to, 'call-accepted', payload)
        console.log('call-accept forwarded from', user._id.toString(), 'to', data.to)
      } catch (e) { console.error('call-accept err', e && e.message) }
    })

    socket.on('call-decline', async (data) => {
      // data: { to }
      try {
        const payload = { from: user._id.toString() }
        await emitToTarget(data.to, 'call-declined', payload)
        console.log('call-decline forwarded from', user._id.toString(), 'to', data.to)
      } catch (e) { console.error('call-decline err', e && e.message) }
    })

    // WebRTC signaling
    socket.on('signal-offer', async (data) => {
      // data: { to, sdp }
      try {
        const payload = { from: user._id.toString(), sdp: data.sdp }
        await emitToTarget(data.to, 'signal-offer', payload)
      } catch (e) { console.error('signal-offer err', e && e.message) }
    });

    socket.on('signal-answer', async (data) => {
      try {
        const payload = { from: user._id.toString(), sdp: data.sdp }
        await emitToTarget(data.to, 'signal-answer', payload)
      } catch (e) { console.error('signal-answer err', e && e.message) }
    });

    socket.on('signal-ice', async (data) => {
      try {
        const payload = { from: user._id.toString(), candidate: data.candidate }
        await emitToTarget(data.to, 'signal-ice', payload)
      } catch (e) { console.error('signal-ice err', e && e.message) }
    });

    socket.on('disconnect', async () => {
      console.log('socket disconnect', user.email, socket.id);
      await Presence.updateOne({ socketId: socket.id }, { online: false, lastSeen: new Date() });
      // check if other sockets exist for this user
      const others = await Presence.findOne({ userId: user._id, online: true });
      if (!others) {
        user.status = 'offline';
        user.lastSeen = new Date();
        await user.save();
        io.emit('user-offline', { userId: user._id.toString(), lastSeen: user.lastSeen });
      }
    });

    // respond to explicit client requests for online users
    socket.on('request-online-users', async () => {
      try {
        const presences = await Presence.find({ online: true }).lean()
        const ids = Array.from(new Set(presences.map(p => p.userId.toString())))
        const users = await User.find({ _id: { $in: ids } }).select('name avatar').lean()
        const byId = users.reduce((acc, u) => { acc[u._id.toString()] = u; return acc }, {})
        const out = ids.map(id => ({ userId: id, name: byId[id]?.name || null, avatar: byId[id]?.avatar || null }))
        try { socket.emit('online-users', out) } catch (e) { /* ignore */ }
      } catch (err) {
        console.warn('request-online-users error', err && err.message)
      }
    })
  });
};

module.exports = { socketHandler };
