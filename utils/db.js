const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/gallery.json');

function ensureDbExists() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify([]), 'utf8');
  }
}

function getGallery() {
  ensureDbExists();
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

function saveGallery(items) {
  ensureDbExists();
  fs.writeFileSync(DB_PATH, JSON.stringify(items, null, 2), 'utf8');
}

module.exports = { getGallery, saveGallery };
