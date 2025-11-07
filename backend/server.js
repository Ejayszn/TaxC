require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const db = new sqlite3.Database('./db.sqlite');
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

// Middleware
app.use(cors({ origin: 'http://localhost:5500', credentials: true })); // Adjust port
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../frontend')));

// Init DB
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS purchases (
    user_id INTEGER,
    ebook_title TEXT,
    file TEXT,
    price INTEGER,
    txn_ref TEXT,
    purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
});

// === AUTH MIDDLEWARE ===
const authenticate = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.clearCookie('token');
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// === ROUTES ===

// Register
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });

  const hashed = await bcrypt.hash(password, 10);
  db.run('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hashed], function(err) {
    if (err) return res.status(400).json({ error: 'Email already exists' });
    const token = jwt.sign({ id: this.lastID, name, email }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, secure: false, sameSite: 'lax' });
    res.json({ success: true, redirect: req.query.redirect || '/' });
  });
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err || !user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, secure: false, sameSite: 'lax' });
    res.json({ success: true, redirect: req.query.redirect || '/' });
  });
});

// Get Me
app.get('/api/me', authenticate, (req, res) => {
  res.json({ user: { name: req.user.name, email: req.user.email } });
});

// Logout
app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// Check if purchased
app.get('/api/purchased', authenticate, (req, res) => {
  const title = req.query.title;
  db.get('SELECT * FROM purchases WHERE user_id = ? AND ebook_title = ?', [req.user.id, title], (err, row) => {
    res.json({ purchased: !!row });
  });
});

// Record purchase (after payment)
app.post('/api/purchase', authenticate, (req, res) => {
  const { title, file, price, txn_ref } = req.body;
  db.run('INSERT INTO purchases (user_id, ebook_title, file, price, txn_ref) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, title, file, price, txn_ref], (err) => {
      if (err) return res.status(500).json({ error: 'Purchase failed' });
      res.json({ success: true });
    });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', req.path === '/' ? 'index.html' : req.path));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});