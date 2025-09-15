const express = require('express');
const { authMiddleware } = require('../utils/auth');
const Message = require('../models/message');
const multer = require('multer');
const { uploadStream } = require('../utils/cloudinary');

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

// GET conversations for current user (latest message per correspondent)
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    const conv = await Message.aggregate([
      { $match: { $or: [ { from: userId }, { to: userId } ] } },
      { $project: { from: 1, to: 1, text: 1, createdAt: 1 } },
      { $sort: { createdAt: -1 } },
      { $addFields: { other: { $cond: [{ $eq: ["$from", userId] }, "$to", "$from"] } } },
      { $group: { _id: "$other", lastMessage: { $first: "$text" }, lastAt: { $first: "$createdAt" } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { userId: { $toString: '$_id' }, name: '$user.name', avatar: '$user.avatar', lastMessage: '$lastMessage', lastAt: '$lastAt' } },
      { $sort: { lastAt: -1 } }
    ]).exec();
    res.json({ conversations: conv });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET messages for conversation between two users
router.get('/:withUserId', authMiddleware, async (req, res) => {
  const { withUserId } = req.params;
  const limit = parseInt(req.query.limit || '50');
  const messages = await Message.find({
    $or: [
      { from: req.user._id, to: withUserId },
      { from: withUserId, to: req.user._id }
    ]
  }).sort({ createdAt: -1 }).limit(limit).populate('from', 'name avatar').populate('to', 'name avatar');
  res.json({ messages: messages.reverse() });
});

// POST message (with optional image upload)
router.post('/', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { to, text } = req.body;
    let image;
    if (req.file) {
      const maxBytes = (parseInt(process.env.MAX_CHAT_IMAGE_MB || '5') * 1024 * 1024);
      if (req.file.size > maxBytes) return res.status(413).json({ message: 'Image too large' });
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(req.file.mimetype)) return res.status(400).json({ message: 'Invalid image type' });
      const result = await uploadStream(req.file.buffer, { folder: 'chat_images' });
      image = { url: result.secure_url, public_id: result.public_id, bytes: result.bytes, width: result.width, height: result.height, format: result.format };
    }
    const msg = await Message.create({ from: req.user._id, to, text, image });
    // Note: real-time emission via socket is handled in socket handler when saved or created
    res.json({ message: msg });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
