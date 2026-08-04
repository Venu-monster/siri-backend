# Siri Beauty World — Admin Backend

Lets you (the owner) log in from your phone and upload photos/videos of your
work. They're instantly available to your website through a public read-only
API — nobody but you can add, edit, or delete anything.

## What's inside

```
server.js          → the whole API (login, upload, gallery)
public/admin.html  → the mobile admin page you open on your phone
middleware/auth.js → checks you're logged in before allowing uploads/deletes
utils/db.js        → simple JSON file that stores captions/filenames
uploads/           → the actual photo/video files live here
data/gallery.json  → the list of what's been uploaded
scripts/hash-password.js → turns your chosen password into a secure hash
```

## 1. Install

You need [Node.js](https://nodejs.org) 18 or newer installed on whatever
machine or hosting service you use.

```bash
npm install
```

## 2. Configure your login

```bash
cp .env.example .env
```

Then generate a password hash (this keeps your real password out of the
config file):

```bash
npm run hash-password -- "ChooseAStrongPassword123"
```

This prints a line like `ADMIN_PASSWORD_HASH=$2a$12$...`. Copy it into `.env`.

Open `.env` and set:

- `ADMIN_PHONE` — the only phone number allowed to log in (digits only)
- `ADMIN_PASSWORD_HASH` — the hash you just generated
- `JWT_SECRET` — any long random string (mash your keyboard)
- `ALLOWED_ORIGINS` — once your website is live, set this to your website's
  domain, e.g. `https://siribeautyworld.com`, so random sites can't read
  your gallery API. `*` is fine while you're testing locally.

## 3. Run it

```bash
npm start
```

Visit `http://localhost:4000/admin` to see the admin panel.

## 4. Log in from your phone

Once this is deployed online (see below), open the admin URL in your phone's
browser (e.g. `https://your-backend-domain.com/admin`), log in with your
phone number and password, and:

- **Add to Home Screen** (Safari/Chrome menu) so it opens like a real app
- Tap the upload box to take a new photo/video or pick one from your gallery
- Add an optional caption and tap **Upload**
- It appears instantly under "Live on Website" — tap **Delete** to remove
  anything

Your login stays saved on your phone for 30 days, so you won't need to log
in every time.

## 5. Connect it to your website

Your public gallery feed is at:

```
GET https://your-backend-domain.com/api/gallery
```

It returns everything you've uploaded:

```json
[
  { "id": "...", "type": "image", "url": "/uploads/xxx.jpg", "caption": "Bridal look", "uploadedAt": "..." },
  { "id": "...", "type": "video", "url": "/uploads/yyy.mp4", "caption": "Hair spa demo", "uploadedAt": "..." }
]
```

See `gallery-integration-snippet.html` (included alongside this backend) for
the exact code to drop into your website so the Gallery section pulls from
this feed automatically, live photos and videos included.

## 6. Deploying so it works outside your home Wi-Fi

Any Node.js host works. Easiest free/cheap options:

- **Render.com** — New → Web Service → connect this folder/repo → Build
  command `npm install`, Start command `npm start` → add your `.env`
  variables under Environment → add a **Persistent Disk** mounted at
  `/opt/render/project/src/uploads` (and another for `/data` if you want
  `gallery.json` to survive redeploys) so uploaded files aren't wiped
- **Railway.app** — similar flow, supports persistent volumes
- A basic **VPS** (DigitalOcean, Hetzner, etc.) with `pm2` to keep it running

⚠️ Important: on most free hosting platforms, the filesystem resets on every
deploy. Attach a persistent volume/disk to the `uploads/` and `data/`
folders, or later upgrade storage to something like Cloudflare R2 / AWS S3
if your library grows large. For a single studio's photos this simple setup
is normally enough for a long time.

## Security notes

- Always deploy behind **HTTPS** (Render/Railway give you this
  automatically) — camera access on phones requires it, and it keeps your
  login safe on public Wi-Fi
- Only one login is possible: your phone number + password. There's no
  public sign-up
- Failed login attempts are rate-limited (8 tries per 15 minutes) to block
  guessing
- Set `ALLOWED_ORIGINS` to your real website domain once it's live
