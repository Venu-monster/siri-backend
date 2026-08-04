require("dotenv").config();

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");

const db = require("./utils/db");
const { requireAdmin } = require("./middleware/auth");

// ── Sanity-check required env vars ──────────────────────────────
const REQUIRED_ENV = ["JWT_SECRET", "ADMIN_PHONE", "ADMIN_PASSWORD_HASH"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key] || process.env[key].includes("replace_with") || process.env[key].includes("paste_generated")) {
    console.error(`\nMissing/placeholder env var: ${key}. Check your .env file (see .env.example).\n`);
    process.exit(1);
  }
}

const PORT = process.env.PORT || 4000;
const UPLOAD_DIR = path.join(__dirname, "uploads");
const MAX_IMAGE_BYTES = Number(process.env.UPLOAD_MAX_IMAGE_MB || 10) * 1024 * 1024;
const MAX_VIDEO_BYTES = Number(process.env.UPLOAD_MAX_VIDEO_MB || 150) * 1024 * 1024;
const HARD_MAX_BYTES = Math.max(MAX_IMAGE_BYTES, MAX_VIDEO_BYTES);

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.disable("x-powered-by");
app.use(express.json());

// ── CORS ─────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((s) => s.trim());
app.use(
  cors({
    origin: allowedOrigins.includes("*") ? true : allowedOrigins,
  })
);

// ── Static files ─────────────────────────────────────────────────
app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "7d" }));
app.use("/admin", express.static(path.join(__dirname, "public")));
app.get(["/admin", "/admin/"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// ── Login (rate-limited so a stranger can't brute-force it) ───────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
});

app.post("/api/admin/login", loginLimiter, async (req, res) => {
  const { phone, password } = req.body || {};
  if (!phone || !password) {
    return res.status(400).json({ error: "Phone and password are required." });
  }

  const cleanPhone = String(phone).replace(/\D/g, "").slice(-10);
  const validPhone = cleanPhone === process.env.ADMIN_PHONE.replace(/\D/g, "").slice(-10);
  const validPassword = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);

  if (!validPhone || !validPassword) {
    return res.status(401).json({ error: "Incorrect phone number or password." });
  }

  const token = jwt.sign({ role: "admin", phone: cleanPhone }, process.env.JWT_SECRET, {
    expiresIn: "30d", // long-lived so the admin doesn't get logged out constantly on their phone
  });

  res.json({ token });
});

// ── Multer upload config ──────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = crypto.randomUUID() + ext;
    cb(null, name);
  },
});

function fileFilter(req, file, cb) {
  const isImage = file.mimetype.startsWith("image/");
  const isVideo = file.mimetype.startsWith("video/");
  if (!isImage && !isVideo) {
    return cb(new Error("Only image or video files are allowed."));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: HARD_MAX_BYTES },
});

// ── Upload a photo or video (admin only) ───────────────────────────
app.post("/api/admin/upload", requireAdmin, (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || "Upload failed." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file received." });
    }

    const isVideo = req.file.mimetype.startsWith("video/");
    const type = isVideo ? "video" : "image";
    const limit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

    if (req.file.size > limit) {
      fs.unlink(req.file.path, () => {});
      const limitMb = Math.round(limit / (1024 * 1024));
      return res.status(400).json({
        error: `${type === "video" ? "Video" : "Image"} is too large. Max ${limitMb}MB.`,
      });
    }

    const item = {
      id: crypto.randomUUID(),
      type,
      filename: req.file.filename,
      url: `/uploads/${req.file.filename}`,
      caption: (req.body.caption || "").toString().slice(0, 200),
      uploadedAt: new Date().toISOString(),
    };

    db.add(item);
    res.status(201).json(item);
  });
});

// ── Public read-only gallery feed (used by the website) ────────────
app.get("/api/gallery", (req, res) => {
  const items = db.getAll().map(({ id, type, url, caption, uploadedAt }) => ({
    id,
    type,
    url,
    caption,
    uploadedAt,
  }));
  res.json(items);
});

// ── Admin-only gallery management ───────────────────────────────────
app.get("/api/admin/gallery", requireAdmin, (req, res) => {
  res.json(db.getAll());
});

app.patch("/api/admin/gallery/:id", requireAdmin, (req, res) => {
  const { caption } = req.body || {};
  const updated = db.update(req.params.id, {
    caption: (caption || "").toString().slice(0, 200),
  });
  if (!updated) return res.status(404).json({ error: "Not found." });
  res.json(updated);
});

app.delete("/api/admin/gallery/:id", requireAdmin, (req, res) => {
  const item = db.remove(req.params.id);
  if (!item) return res.status(404).json({ error: "Not found." });

  const filePath = path.join(UPLOAD_DIR, item.filename);
  fs.unlink(filePath, () => {}); // ignore errors (file may already be gone)

  res.json({ success: true });
});

// ── Health check (handy for uptime monitors / hosting platforms) ────
app.get("/api/health", (req, res) => res.json({ ok: true }));

// ── Error handler (catches unexpected errors incl. bad multer input) ─
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

app.listen(PORT, () => {
  console.log(`Siri Beauty World admin backend running on port ${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
