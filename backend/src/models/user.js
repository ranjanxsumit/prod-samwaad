const mongoose = require('mongoose');

const AvatarSchema = new mongoose.Schema({
  url: String,
  public_id: String,
  bytes: Number,
  width: Number,
  height: Number,
  format: String
}, { _id: false });

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  avatar: AvatarSchema,
  status: { type: String, enum: ['online', 'offline'], default: 'offline' },
  lastSeen: Date
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
