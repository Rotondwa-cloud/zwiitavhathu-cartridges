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

/* tables unchanged … */

/* ===============================
   ROUTES – PAGES
================================ */

// ✅ HOME PAGE
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// ✅ ABOUT PAGE
app.get('/about', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/about.html'));
});

// ✅ PRODUCTS PAGE
app.get('/products', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/products.html'));
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
   API ROUTES
================================ */
/* all your API routes remain exactly the same */

/* ===============================
   START SERVER
================================ */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});


