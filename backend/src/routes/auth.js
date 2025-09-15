const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const User = require('../models/user');
const { signToken } = require('../utils/auth');

const router = express.Router();

const SignupSchema = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8) });
const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

router.post('/signup', async (req, res) => {
  try {
    const parsed = SignupSchema.parse(req.body);
    const exists = await User.findOne({ email: parsed.email });
    if (exists) return res.status(400).json({ message: 'Email already in use' });
  const saltRounds = 12;
  const passwordHash = bcrypt.hashSync(parsed.password, saltRounds);
    const user = await User.create({ name: parsed.name, email: parsed.email, passwordHash });
    const token = signToken(user);
    res.json({ user: { id: user._id, name: user.name, email: user.email }, token });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const parsed = LoginSchema.parse(req.body);
    const user = await User.findOne({ email: parsed.email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
  const ok = bcrypt.compareSync(parsed.password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    const token = signToken(user);
    res.json({ user: { id: user._id, name: user.name, email: user.email, avatar: user.avatar }, token });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
