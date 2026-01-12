const express = require('express');
const Database = require('better-sqlite3');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;

/* ===============================
   ENVIRONMENT VALIDATION
================================ */
const REQUIRED_ENVS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
  'GOOGLE_EMAIL',
];

REQUIRED_ENVS.forEach(key => {
  if (!process.env[key]) {
    console.error(`❌ Missing environment variable: ${key}`);
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
)`);

db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT,
  customer_email TEXT,
  printer_type TEXT,
  product_id INTEGER,
  quantity INTEGER,
  total REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`);

console.log("✅ SQLite ready");

/* ===============================
   GMAIL API SETUP
================================ */
const OAuth2 = google.auth.OAuth2;

const oauth2Client = new OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

async function sendMail({ subject, html }) {
  try {
    const { token } = await oauth2Client.getAccessToken();

    if (!token) {
      throw new Error("Failed to generate access token");
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: process.env.GOOGLE_EMAIL,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
        accessToken: token,
      },
    });

    const info = await transporter.sendMail({
      from: `"Zwiitavhathu Cartridges" <${process.env.GOOGLE_EMAIL}>`,
      to: process.env.GOOGLE_EMAIL,
      subject,
      html,
    });

    console.log("📧 Email sent successfully:", info.messageId);

  } catch (err) {
    console.error("❌ Gmail sendMail error:", err.message || err);
    throw err;
  }
}

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
    res.status(500).json({ error: "Email failed" });
  }
});

/* ===============================
   START SERVER
================================ */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
