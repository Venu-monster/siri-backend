const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Helper to safely load db.js if available
let getGallery = () => [];
let saveGallery = () => {};
try {
  const db = require('./utils/db');
  getGallery = db.getGallery;
  saveGallery = db.saveGallery;
} catch (e) {
  console.log('utils/db.js not found, using fallback in-memory/file storage');
}

// Helper for auth middleware
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

const app = express();
const PORT = process.env.PORT || 10000;

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure Multer Storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const upload = multer({ storage });

// Middlewares
app.use(cors({ origin: process.env.ALLOWED_ORIGINS || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, 'public')));

// Admin Login Route
app.post('/api/login', async (req, res) => {
  const { phone, password } = req.body;
  
  if (phone !== process.env.ADMIN_PHONE) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const validPassword = await bcrypt.compare(
    password || '', 
    process.env.ADMIN_PASSWORD_HASH || ''
  );

  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { phone }, 
    process.env.JWT_SECRET || 'fallback_secret', 
    { expiresIn: '7d' }
  );

  res.json({ token });
});

// Public Gallery Feed
app.get('/api/gallery', (req, res) => {
  res.json(getGallery());
});

// Media Upload Route
app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const gallery = getGallery();
  const newItem = {
    id: Date.now().toString(),
    type: req.file.mimetype.startsWith('video/') ? 'video' : 'image',
    url: `/uploads/${req.file.filename}`,
    caption: req.body.caption || '',
    createdAt: new Date().toISOString()
  };

  gallery.unshift(newItem);
  saveGallery(gallery);

  res.json({ message: 'Success', item: newItem });
});

// Delete Gallery Item
app.delete('/api/gallery/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  let gallery = getGallery();
  
  const item = gallery.find(i => i.id === id);
  if (item) {
    const filePath = path.join(__dirname, item.url);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }
  }

  gallery = gallery.filter(i => i.id !== id);
  saveGallery(gallery);

  res.json({ message: 'Deleted' });
});

// Admin Panel fallback
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
