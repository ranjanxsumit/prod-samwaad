const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const { authMiddleware } = require('../utils/auth');
const { uploadStream } = require('../utils/cloudinary');
const User = require('../models/user');

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

const Presence = require('../models/presence');

router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// Return currently online users (simple public endpoint for dev fallback polling)
router.get('/online', async (req, res) => {
  try {
    const presences = await Presence.find({ online: true }).lean()
    const ids = Array.from(new Set(presences.map(p => p.userId.toString())))
    const users = await User.find({ _id: { $in: ids } }).select('name avatar').lean()
    const byId = users.reduce((acc, u) => { acc[u._id.toString()] = u; return acc }, {})
    const out = ids.map(id => ({ userId: id, name: byId[id]?.name || null, avatar: byId[id]?.avatar || null }))
    res.json(out)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Public: fetch basic user info by id
router.get('/:id', async (req, res) => {
  try {
    const u = await User.findById(req.params.id).select('name avatar').lean()
    if (!u) return res.status(404).json({ message: 'User not found' })
    res.json({ id: u._id.toString(), name: u.name, avatar: u.avatar })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.patch('/me/profile', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    const { name } = req.body;
    if (req.file) {
      const maxBytes = (parseInt(process.env.MAX_CHAT_IMAGE_MB || '5') * 1024 * 1024);
      if (req.file.size > maxBytes) return res.status(413).json({ message: 'Avatar too large' });
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(req.file.mimetype)) return res.status(400).json({ message: 'Invalid image type' });
      const result = await uploadStream(req.file.buffer, { folder: 'avatars' });
      req.user.avatar = {
        url: result.secure_url,
        public_id: result.public_id,
        bytes: result.bytes,
        width: result.width,
        height: result.height,
        format: result.format
      };
    }
    if (name) req.user.name = name;
    await req.user.save();
    res.json({ user: req.user });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Lightweight health check for Cloudinary connectivity
router.get('/_health/cloudinary', async (req, res) => {
  try {
    const { cloudinary } = require('../utils/cloudinary');
    // call a harmless method to ensure configuration is valid
    const info = await cloudinary.api.ping ? await cloudinary.api.ping() : { ok: true };
    res.json({ ok: true, info });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

module.exports = router;
