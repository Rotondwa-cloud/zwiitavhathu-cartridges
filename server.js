const express = require('express');
const Database = require('better-sqlite3');   
const bodyParser = require('body-parser');
const path = require('path');
const nodemailer = require('nodemailer');
const fs = require('fs');
const mammoth = require('mammoth');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================
// MIDDLEWARE
// ============================
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================
// SQLite (better-sqlite3 FIX)
// ============================
let db;
try {
    db = new Database(path.join(__dirname, 'database.db'));
    console.log("✅ SQLite ready.");
} catch (err) {
    console.error("❌ SQLite initialization failed:", err);
}

try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS cartridges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            description TEXT,
            price REAL,
            image TEXT,
            code TEXT,
            is_query_only INTEGER DEFAULT 0
        )
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
        )
    `);

} catch (err) {
    console.error("❌ DB table creation error:", err);
}


// ============================
// EMAIL SETUP
// ============================
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Verify transporter
transporter.verify((err, success) => {
    if (err) {
        console.error("❌ Email transporter failed:", err);
    } else {
        console.log("✅ Email transporter ready.");
    }
});


// ============================
// IMPORT WORD DOCUMENT
// ============================
app.get('/api/import-cartridges', async (req, res) => {
    try {
        const filePath = path.join(__dirname, 'CARTRIDGE LIST FOR ZWIITABROTHERS Updated.docx');

        if (!fs.existsSync(filePath)) {
            console.error("❌ Word file not found:", filePath);
            return res.status(400).json({ error: "File not found" });
        }

        const result = await mammoth.extractRawText({ path: filePath });
        const lines = result.value.split("\n").map(l => l.trim()).filter(Boolean);

        const priceRegex = /R\s*([\d,]+(?:\.\d+)?)/i;
        const codeRegex = /\b([A-Z]{1,4}\d{1,4}[A-Z0-9\-]*)\b/;

        db.exec("DELETE FROM cartridges");

        const insert = db.prepare(`
            INSERT INTO cartridges (name, description, price, image, code, is_query_only)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        let count = 0;

        for (let line of lines) {
            if (/^(Model|Code|Price|Cartridge|List)/i.test(line)) continue;

            const priceMatch = line.match(priceRegex);
            const codeMatch = line.match(codeRegex);

            const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null;
            const code = codeMatch ? codeMatch[1] : null;

            let name = line.replace(priceRegex, '').replace(codeRegex, '').trim();
            if (!name || name.length < 3) continue;

            insert.run(name, name, price, "default.jpg", code, price ? 0 : 1);
            count++;
        }

        res.json({ success: true, imported: count });

    } catch (err) {
        console.error("❌ Import failed:", err);
        res.status(500).json({ error: "Import failed" });
    }
});


// ============================
// GET PRODUCTS
// ============================
app.get('/api/cartridges', (req, res) => {
    try {
        const q = `%${(req.query.q || '').trim()}%`;
        const rows = db.prepare(
            "SELECT * FROM cartridges WHERE name LIKE ? OR code LIKE ? ORDER BY name"
        ).all(q, q);

        res.json(rows);
    } catch (err) {
        console.error("❌ GET /api/cartridges error:", err);
        res.status(500).json({ error: "Failed to load cartridges" });
    }
});


// ============================
// PLACE ORDER
// ============================
app.post('/api/order', (req, res) => {
    try {
        const { name, email, printerType, productId, quantity } = req.body;

        const product = db.prepare("SELECT * FROM cartridges WHERE id = ?").get(productId);
        if (!product) return res.status(400).json({ error: "Product not found" });
        if (product.is_query_only) return res.status(400).json({ error: "Price query required" });

        const total = product.price * quantity;

        const result = db.prepare(`
            INSERT INTO orders (customer_name, customer_email, printer_type, product_id, quantity, total)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(name, email, printerType, productId, quantity, total);

        res.json({ success: true, orderId: result.lastInsertRowid });

    } catch (err) {
        console.error("❌ POST /api/order error:", err);
        res.status(500).json({ error: "Order failed" });
    }
});


// ============================
// PRICE QUERY
// ============================
app.post('/api/query', (req, res) => {
    try {
        const { name, email, printerType, productId, notes } = req.body;

        const product = db.prepare("SELECT * FROM cartridges WHERE id = ?").get(productId);
        if (!product) return res.status(400).json({ error: "Product not found" });

        transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: `Price Query - ${product.name}`,
            html: `
                <h2>Price Query</h2>
                <p>Name: ${name}</p>
                <p>Email: ${email}</p>
                <p>Printer: ${printerType}</p>
                <p>Product: ${product.name}</p>
                <p>Notes: ${notes || "None"}</p>
            `
        }, (err, info) => {
            if (err) {
                console.error("❌ Email send error:", err);
                return res.status(500).json({ error: "Email failed" });
            }

            console.log("📧 Email sent:", info.response);
            res.json({ success: true });
        });

    } catch (err) {
        console.error("❌ POST /api/query error:", err);
        res.status(500).json({ error: "Query failed" });
    }
});


// ============================
// STATIC PAGES
// ============================
app.get('/', (req, res) => {
    try {
        res.sendFile(path.join(__dirname, 'public/index.html'));
    } catch (err) {
        console.error("❌ Error serving index:", err);
        res.status(500).send("Server error");
    }
});


// ============================
// START SERVER
// ============================
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
