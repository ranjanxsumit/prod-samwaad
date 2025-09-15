const mongoose = require('mongoose');

const ImageSchema = new mongoose.Schema({
  url: String,
  public_id: String,
  bytes: Number,
  width: Number,
  height: Number,
  format: String
}, { _id: false });

const MessageSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  text: String,
  image: ImageSchema,
  delivered: { type: Boolean, default: false },
  read: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Message', MessageSchema);
