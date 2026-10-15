const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const sign = (u) => jwt.sign({ id: u._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
const pub = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, department: u.department });

router.post('/register', async (req, res) => {
  const { name, email, password, department } = req.body;
  if (!name || !email || !password || password.length < 6)
    return res.status(400).json({ message: 'Name, email and a password of 6+ characters are required' });
  if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ message: 'This email is already registered' });
  const user = await User.create({ name, email, department, password: await bcrypt.hash(password, 10) });
  res.status(201).json({ token: sign(user), user: pub(user) });
});
router.post('/login', async (req, res) => {
  const user = await User.findOne({ email: (req.body.email || '').toLowerCase() });
  if (!user || !(await bcrypt.compare(req.body.password || '', user.password)))
    return res.status(401).json({ message: 'Email or password is incorrect' });
  res.json({ token: sign(user), user: pub(user) });
});

router.get('/me', auth, (req, res) => res.json({ user: pub(req.user) }));
module.exports = router;
