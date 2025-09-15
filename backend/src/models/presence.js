const mongoose = require('mongoose');

const PresenceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  socketId: String,
  online: { type: Boolean, default: true },
  lastSeen: Date
}, { timestamps: true });

module.exports = mongoose.model('Presence', PresenceSchema);
