const express = require('express');
const Database = require('better-sqlite3');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;

/* ===============================
   ENV VALIDATION
================================ */
const REQUIRED_ENVS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
  'GOOGLE_EMAIL'
];

REQUIRED_ENVS.forEach(key => {
  if (!process.env[key]) {
    console.error(`❌ MISSING ENV: ${key}`);
  }
});

/* ===============================
   MIDDLEWARE
================================ */
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ===============================
   SQLITE DATABASE
================================ */
const db = new Database(path.join(__dirname, 'database.db'));

// Cartridges table
db.exec(`
CREATE TABLE IF NOT EXISTS cartridges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  description TEXT,
  price REAL,
  image TEXT,
  code TEXT,
  is_query_only INTEGER DEFAULT 0
);
`);

// Orders table
db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT,
  customer_email TEXT,
  printer_type TEXT,
  product_id INTEGER,
  quantity INTEGER,
  total REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES cartridges(id)
);
`);

// Ensure customer_phone column exists
try {
  db.prepare("ALTER TABLE orders ADD COLUMN customer_phone TEXT").run();
} catch (err) {
  if (!err.message.includes("duplicate column name")) {
    console.error("❌ Failed to add customer_phone column:", err);
  }
}

// Cartridge requests table
db.exec(`
CREATE TABLE IF NOT EXISTS cartridge_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT,
  customer_email TEXT,
  printer_type TEXT,
  requested_item TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`);

console.log("✅ SQLite ready");

/* ===============================
   GMAIL API SETUP
================================ */
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

function encodeUTF8Base64(str) {
  return `=?UTF-8?B?${Buffer.from(str, 'utf-8').toString('base64')}?=`;
}

async function sendMail({ subject, html, to }) {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const message = [
    `From: "Zwiitavhathu Cartridges" <${process.env.GOOGLE_EMAIL}>`,
    `To: ${to || process.env.GOOGLE_EMAIL}`,
    `Subject: ${encodeUTF8Base64(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    html
  ].join('\n');

  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage }
  });
}

/* ===============================
   PAGE ROUTES
================================ */

// HOME
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ✅ ABOUT PAGE (FIX)
app.get('/about', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'about.html'));
});

/* ===============================
   TEST EMAIL
================================ */
app.get('/test-email', async (req, res) => {
  try {
    await sendMail({
      subject: "TEST EMAIL – Zwiitavhathu",
      html: "<h1>If you see this, Gmail API works 🎉</h1>"
    });
    res.send("✅ Test email sent");
  } catch {
    res.status(500).send("❌ Test email failed");
  }
});

/* ===============================
   IMPORT CARTRIDGES
================================ */
app.get('/api/import-cartridges', async (req, res) => {
  try {
    const filePath = path.join(__dirname, 'CARTRIDGE LIST FOR ZWIITABROTHERS Updated.docx');
    if (!fs.existsSync(filePath)) return res.status(400).json({ error: "File missing" });

    const result = await mammoth.extractRawText({ path: filePath });
    const lines = result.value.split('\n').map(l => l.trim()).filter(Boolean);

    const priceRegex = /R\s*([\d,]+(?:\.\d+)?)/i;
    const codeRegex = /\b([A-Z]{1,4}\d{1,4}[A-Z0-9\-]*)\b/;

    db.exec("DELETE FROM cartridges");
    const insert = db.prepare(`
      INSERT INTO cartridges (name, description, price, image, code, is_query_only)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    lines.forEach(line => {
      const price = line.match(priceRegex)?.[1]?.replace(/,/g, '');
      const code = line.match(codeRegex)?.[1];
      const name = line.replace(priceRegex, '').replace(codeRegex, '').trim();
      if (name) insert.run(name, name, price || null, "default.jpg", code, price ? 0 : 1);
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Import failed" });
  }
});

/* ===============================
   API ROUTES (unchanged)
================================ */
// /api/cartridges
// /api/order
// /api/query
// /api/request-cartridge
// (your existing logic remains intact)

/* ===============================
   START SERVER
================================ */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
