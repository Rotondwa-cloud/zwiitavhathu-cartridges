const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const nodemailer = require('nodemailer');
const fs = require('fs');
const mammoth = require('mammoth'); // npm install mammoth

const app = express();
const PORT = 3000;

// ============================
// MIDDLEWARE
// ============================
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================
// DATABASE SETUP
// ============================
const db = new sqlite3.Database('./database.db', (err) => {
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
// EMAIL SETUP (Gmail SMTP)
// ============================
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // SSL
  auth: {
    user: "rotondwaramovha9@gmail.com",
    pass: "tbxxstixtzpkuvdv" // Gmail App Password (16 chars, no spaces)
  }
});

// Verify email connection
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Email server connection failed:", error.message);
  } else {
    console.log("✅ Email server is ready to send messages.");
  }
});

// ============================
// IMPORT FROM WORD DOCUMENT (Run Once)
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
        const image = 'images/default_cart.jpg';
        stmt.run(name, name, price, image, code, isQueryOnly);
        count++;
      });

      stmt.finalize();
      console.log(`🗂️ Imported ${count} cartridges.`);
      res.json({ success: true, count });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Import failed." });
  }
});

// ============================
// PUBLIC API
// ============================

// Get cartridges (with optional search)
app.get('/api/cartridges', (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : '%';
  db.all(
    "SELECT * FROM cartridges WHERE name LIKE ? OR code LIKE ? ORDER BY name",
    [q, q],
    (err, rows) => {
      if (err) res.status(500).json({ error: err.message });
      else res.json(rows);
    }
  );
});

// Place Order (priced products)
app.post('/api/order', (req, res) => {
  const { name, email, printerType, productId, quantity } = req.body;
  if (!name || !email || !printerType || !productId || !quantity)
    return res.status(400).json({ error: "All fields are required." });

  db.get("SELECT * FROM cartridges WHERE id = ?", [productId], (err, product) => {
    if (err || !product) return res.status(400).json({ error: "Invalid product." });
    if (product.is_query_only) return res.status(400).json({ error: "This product requires a price query." });

    const total = product.price * quantity;

    db.run(
      "INSERT INTO orders (customer_name, customer_email, printer_type, product_id, quantity, total) VALUES (?, ?, ?, ?, ?, ?)",
      [name, email, printerType, productId, quantity, total],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });

        // Admin notification email
        const adminMail = {
          from: '"Zwiitavhathu Cartridges" <rotondwaramovha9@gmail.com>',
          to: "rotondwaramovha9@gmail.com",
          subject: `🛒 New Order - ${product.name}`,
          html: `
            <h2>New Order Received</h2>
            <p><strong>Customer:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Printer:</strong> ${printerType}</p>
            <p><strong>Product:</strong> ${product.name} (${product.code || "N/A"})</p>
            <p><strong>Quantity:</strong> ${quantity}</p>
            <p><strong>Total:</strong> R${total}</p>
          `
        };

        // Customer confirmation email
        const customerMail = {
          from: '"Zwiitavhathu Cartridges" <rotondwaramovha9@gmail.com>',
          to: email,
          subject: `✅ Order Confirmation - ${product.name}`,
          html: `
            <h2>Thank you for your order!</h2>
            <p>Dear ${name},</p>
            <p>We’ve received your order for <strong>${product.name}</strong>.</p>
            <p><strong>Quantity:</strong> ${quantity}<br>
            <strong>Total:</strong> R${total}</p>
            <p>We’ll contact you soon to confirm delivery or pickup details.</p>
            <p>– Zwiitavhathu Cartridges Team</p>
          `
        };

        transporter.sendMail(adminMail, (err) => {
          if (err) console.error("❌ Admin email failed:", err);
          else console.log("📧 Admin notified of order.");
        });

        transporter.sendMail(customerMail, (err) => {
          if (err) console.error("❌ Customer email failed:", err);
          else console.log("📨 Customer confirmation sent.");
        });

        res.json({ success: true, orderId: this.lastID });
      }
    );
  });
});

// Handle Query (for unpriced products)
app.post('/api/query', (req, res) => {
  const { name, email, printerType, productId, notes } = req.body;
  if (!name || !email || !productId)
    return res.status(400).json({ error: "Missing required fields." });

  db.get("SELECT * FROM cartridges WHERE id = ?", [productId], (err, product) => {
    if (err || !product) return res.status(400).json({ error: "Invalid product." });

    const mailOptions = {
      from: '"Zwiitavhathu Cartridges" <rotondwaramovha9@gmail.com>',
      to: "rotondwaramovha9@gmail.com",
      subject: `💬 Price Query - ${product.name}`,
      html: `
        <h2>Price Query Received</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Printer:</strong> ${printerType || "N/A"}</p>
        <p><strong>Product:</strong> ${product.name} (${product.code || "N/A"})</p>
        <p><strong>Notes:</strong> ${notes || "None provided"}</p>
      `
    };

    transporter.sendMail(mailOptions, (err) => {
      if (err) console.error("❌ Query email failed:", err);
      else console.log("📧 Query email sent to admin.");
    });

    res.json({ success: true });
  });
});

// ============================
// STATIC PAGES
// ============================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/products', (req, res) => res.sendFile(path.join(__dirname, 'public', 'products.html')));
app.get('/admin/products', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin_products.html')));
app.get('/admin/orders', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin_orders.html')));

// ============================
// START SERVER
// ============================
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
