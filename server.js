const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const nodemailer = require('nodemailer');
const fs = require('fs');
const mammoth = require('mammoth');

const app = express();

// 🔥 RENDER USES process.env.PORT
const PORT = process.env.PORT || 3000;

// ============================
// MIDDLEWARE
// ============================
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================
// SQLite DATABASE
// ============================
const dbFile = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) console.error(err);
  console.log("✅ Connected to SQLite database.");
});

db.run(`CREATE TABLE IF NOT EXISTS cartridges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  description TEXT,
  price REAL,
  image TEXT,
  code TEXT,
  is_query_only INTEGER DEFAULT 0
)`);

db.run(`CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT,
  customer_email TEXT,
  printer_type TEXT,
  product_id INTEGER,
  quantity INTEGER,
  total REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES cartridges(id)
)`);

// ============================
// EMAIL SETUP (Render ENV VARS)
// ============================
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,  // MUST set on Render.com
    pass: process.env.EMAIL_PASS   // MUST set on Render.com
  }
});

transporter.verify((err) => {
  if (err) console.error("❌ Email server error:", err.message);
  else console.log("✅ Email server ready.");
});

// ============================
// IMPORT WORD DOCUMENT
// ============================
app.get('/api/import-cartridges', async (req, res) => {
  try {
    const docPath = path.resolve(__dirname, 'CARTRIDGE LIST FOR ZWIITABROTHERS Updated.docx');
    if (!fs.existsSync(docPath)) return res.status(400).json({ error: "File not found." });

    const result = await mammoth.extractRawText({ path: docPath });
    const text = result.value;
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    const priceRegex = /R\s*([\d,]+(?:\.\d+)?)/i;
    const codeRegex = /\b([A-Z]{1,4}\d{1,4}[A-Z0-9\-]*)\b/;

    db.serialize(() => {
      db.run("DELETE FROM cartridges");
      const stmt = db.prepare(
        "INSERT INTO cartridges (name, description, price, image, code, is_query_only) VALUES (?, ?, ?, ?, ?, ?)"
      );

      let count = 0;
      lines.forEach(line => {
        if (/^(Model|Code|Price|Cartridge|List)/i.test(line)) return;

        const priceMatch = line.match(priceRegex);
        const codeMatch = line.match(codeRegex);

        const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null;
        const code = codeMatch ? codeMatch[1] : null;

        let name = line.replace(priceRegex, '').replace(codeRegex, '').trim();
        if (!name || name.length < 3) return;

        const isQueryOnly = price ? 0 : 1;
        const image = 'default.jpg';

        stmt.run(name, name, price, image, code, isQueryOnly);
        count++;
      });

      stmt.finalize();
      console.log(`🗂 Imported ${count} cartridges.`);
      res.json({ success: true, count });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Import failed." });
  }
});

// ============================
// PUBLIC API (PRODUCTS)
// ============================
app.get('/api/cartridges', (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : '%';

  db.all(
    "SELECT * FROM cartridges WHERE (name LIKE ? OR code LIKE ?) AND LENGTH(name) > 2 ORDER BY name",
    [q, q],
    (err, rows) => {
      if (err) res.status(500).json({ error: err.message });
      else res.json(rows);
    }
  );
});

// ============================
// PLACE ORDER (PAID ITEMS)
// ============================
app.post('/api/order', (req, res) => {
  const { name, email, printerType, productId, quantity } = req.body;

  if (!name || !email || !printerType || !productId || !quantity)
    return res.status(400).json({ error: "All fields required." });

  db.get("SELECT * FROM cartridges WHERE id = ?", [productId], (err, product) => {
    if (err || !product) return res.status(400).json({ error: "Product not found." });
    if (product.is_query_only) return res.status(400).json({ error: "Requires price query." });

    const total = product.price * quantity;

    db.run(
      "INSERT INTO orders (customer_name, customer_email, printer_type, product_id, quantity, total) VALUES (?, ?, ?, ?, ?, ?)",
      [name, email, printerType, productId, quantity, total],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });

        // Admin email
        const adminMail = {
          from: process.env.EMAIL_USER,
          to: process.env.EMAIL_USER,
          subject: `🛒 New Order - ${product.name}`,
          html: `
            <h2>New Order</h2>
            <p><b>Name:</b> ${name}</p>
            <p><b>Email:</b> ${email}</p>
            <p><b>Printer:</b> ${printerType}</p>
            <p><b>Product:</b> ${product.name} (${product.code || "N/A"})</p>
            <p><b>Quantity:</b> ${quantity}</p>
            <p><b>Total:</b> R${total}</p>
          `
        };

        const customerMail = {
          from: process.env.EMAIL_USER,
          to: email,
          subject: `Order Confirmed – ${product.name}`,
          html: `
            <h2>Thank You!</h2>
            <p>Your order for <b>${product.name}</b> has been received.</p>
            <p><b>Quantity:</b> ${quantity}</p>
            <p><b>Total:</b> R${total}</p>
          `
        };

        transporter.sendMail(adminMail);
        transporter.sendMail(customerMail);

        res.json({ success: true, orderId: this.lastID });
      }
    );
  });
});

// ============================
// PRICE QUERY (NO PRICE ITEMS)
// ============================
app.post('/api/query', (req, res) => {
  const { name, email, printerType, productId, notes } = req.body;

  if (!name || !email || !productId)
    return res.status(400).json({ error: "Missing fields." });

  db.get("SELECT * FROM cartridges WHERE id = ?", [productId], (err, product) => {
    if (err || !product) return res.status(400).json({ error: "Product not found." });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: `💬 Price Query - ${product.name}`,
      html: `
        <h2>Price Query</h2>
        <p><b>Name:</b> ${name}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Printer:</b> ${printerType}</p>
        <p><b>Product:</b> ${product.name}</p>
        <p><b>Notes:</b> ${notes || "None"}</p>
      `
    };

    transporter.sendMail(mailOptions);
    res.json({ success: true });
  });
});

// ============================
// STATIC PAGES
// ============================
app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

app.get('/products', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'products.html'))
);

app.get('/admin/products', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin_products.html'))
);

app.get('/admin/orders', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin_orders.html'))
);

// ============================
// START SERVER
// ============================
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
