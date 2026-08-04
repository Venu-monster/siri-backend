const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getGallery, saveGallery } = require('./utils/db');
const { requireAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 10000;

// Ensure upload directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const upload = multer({ storage });

// Middleware
app.use(cors({ origin: process.env.ALLOWED_ORIGINS || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, 'public')));

// Admin Login
app.post('/api/login', async (req, res) => {
  const { phone, password } = req.body;
  
  if (phone !== process.env.ADMIN_PHONE) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const validPassword = await bcrypt.compare(
    password, 
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

// Public Gallery API
app.get('/api/gallery', (req, res) => {
  const items = getGallery();
  res.json(items);
});

// Upload Media (Protected Route)
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

// Delete Gallery Item (Protected Route)
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

// Admin Panel route fallback
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
