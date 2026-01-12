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

console.log("🔎 ENV CHECK:", {
  GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN: !!process.env.GOOGLE_REFRESH_TOKEN,
  GOOGLE_EMAIL: !!process.env.GOOGLE_EMAIL,
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

console.log("✅ SQLite ready");

/* ===============================
   GMAIL API SETUP (NO SMTP)
================================ */
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

async function sendMail({ subject, html }) {
  try {
    console.log("📤 Sending email via Gmail API (HTTP)");

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const messageParts = [
      `From: "Zwiitavhathu Cartridges" <${process.env.GOOGLE_EMAIL}>`,
      `To: ${process.env.GOOGLE_EMAIL}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      html
    ];

    const message = messageParts.join('\n');

    const encodedMessage = Buffer
      .from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });

    console.log("📧 Email sent successfully:", res.data.id);
    return res.data;

  } catch (err) {
    console.error("❌ Gmail API error:", err.message || err);
    throw err;
  }
}

/* ===============================
   TEST EMAIL (DEBUG)
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
   IMPORT WORD DOCUMENT
================================ */
app.get('/api/import-cartridges', async (req, res) => {
  try {
    const filePath = path.join(__dirname, 'CARTRIDGE LIST FOR ZWIITABROTHERS Updated.docx');
    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ error: "File missing" });
    }

    const result = await mammoth.extractRawText({ path: filePath });
    const lines = result.value.split('\n').map(l => l.trim()).filter(Boolean);

    const priceRegex = /R\s*([\d,]+(?:\.\d+)?)/i;
    const codeRegex = /\b([A-Z]{1,4}\d{1,4}[A-Z0-9\-]*)\b/;

    db.exec("DELETE FROM cartridges");

    const insert = db.prepare(`
      INSERT INTO cartridges (name, description, price, image, code, is_query_only)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    let count = 0;

    for (const line of lines) {
      const priceMatch = line.match(priceRegex);
      const codeMatch = line.match(codeRegex);

      const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null;
      const code = codeMatch ? codeMatch[1] : null;
      const name = line.replace(priceRegex, '').replace(codeRegex, '').trim();

      if (!name || name.length < 3) continue;

      insert.run(name, name, price, "default.jpg", code, price ? 0 : 1);
      count++;
    }

    res.json({ success: true, imported: count });

  } catch (err) {
    console.error("❌ Import error:", err);
    res.status(500).json({ error: "Import failed" });
  }
});

/* ===============================
   GET PRODUCTS (PRICED ONLY)
================================ */
app.get('/api/cartridges', (req, res) => {
  try {
    const q = `%${(req.query.q || "").trim()}%`;

    const rows = db.prepare(`
      SELECT *
      FROM cartridges
      WHERE price IS NOT NULL
        AND is_query_only = 0
        AND (name LIKE ? OR code LIKE ?)
      ORDER BY name
    `).all(q, q);

    res.json(rows);
  } catch (err) {
    console.error("❌ Fetch products error:", err);
    res.status(500).json({ error: "DB error" });
  }
});

/* ===============================
   PLACE ORDER
================================ */
app.post('/api/order', (req, res) => {
  try {
    const { name, email, printerType, productId, quantity } = req.body;

    const product = db.prepare(
      "SELECT * FROM cartridges WHERE id=?"
    ).get(productId);

    if (!product || product.is_query_only || product.price === null) {
      return res.status(400).json({ error: "Price query required" });
    }

    const total = product.price * quantity;

    const result = db.prepare(`
      INSERT INTO orders
      (customer_name, customer_email, printer_type, product_id, quantity, total)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, email, printerType, productId, quantity, total);

    res.json({ success: true, orderId: result.lastInsertRowid });

  } catch (err) {
    console.error("❌ Order error:", err);
    res.status(500).json({ error: "Order failed" });
  }
});

/* ===============================
   PRICE QUERY (EMAIL)
================================ */
app.post('/api/query', async (req, res) => {
  try {
    const { name, email, printerType, productId, notes } = req.body;

    const product = db.prepare(
      "SELECT * FROM cartridges WHERE id=?"
    ).get(productId);

    if (!product) {
      return res.status(400).json({ error: "Product not found" });
    }

    await sendMail({
      subject: `Price Query – ${product.name}`,
      html: `
        <h2>New Price Query</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Printer:</strong> ${printerType}</p>
        <p><strong>Product:</strong> ${product.name}</p>
        <p><strong>Notes:</strong> ${notes || "None"}</p>
      `
    });

    res.json({ success: true });

  } catch (err) {
    console.error("❌ Query email error:", err);
    res.status(500).json({ error: "Email failed" });
  }
});

/* ===============================
   ROOT
================================ */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

/* ===============================
   START SERVER
================================ */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});



