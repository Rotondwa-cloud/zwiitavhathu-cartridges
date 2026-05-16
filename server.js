const express = require('express');
const basicAuth = require('express-basic-auth');
const Database = require('better-sqlite3');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const { google } = require('googleapis');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;

/* ===============================
   ENV VALIDATION
================================ */
const REQUIRED_ENVS = [
  'GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN','GOOGLE_EMAIL',
  'ADMIN_USER','ADMIN_PASS'
];
REQUIRED_ENVS.forEach(key => {
  if (!process.env[key]) console.error(`❌ MISSING ENV: ${key}`);
});
console.log("🔎 ENV CHECK:", {
  GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN: !!process.env.GOOGLE_REFRESH_TOKEN,
  GOOGLE_EMAIL: !!process.env.GOOGLE_EMAIL,
  ADMIN_USER: !!process.env.ADMIN_USER,
  ADMIN_PASS: !!process.env.ADMIN_PASS,
});

/* ===============================
   MIDDLEWARE
================================ */
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ===============================
   DATABASE
================================ */
const db = new Database(path.join(__dirname, 'database.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS cartridges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, description TEXT, price REAL,
  image TEXT, code TEXT, is_query_only INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT, customer_email TEXT,
  printer_type TEXT, product_id INTEGER,
  quantity INTEGER, total REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES cartridges(id)
);
CREATE TABLE IF NOT EXISTS stock_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER, product_name TEXT,
  movement_type TEXT, quantity INTEGER,
  new_quantity INTEGER, note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cartridge_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT, customer_email TEXT,
  printer_type TEXT, requested_item TEXT,
  notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`);

const safeAlter = (sql) => {
  try { db.prepare(sql).run(); } catch (e) {
    if (!e.message.includes('duplicate column name')) console.error('ALTER error:', e.message);
  }
};
safeAlter("ALTER TABLE orders ADD COLUMN customer_phone TEXT");
safeAlter("ALTER TABLE orders ADD COLUMN invoice_number TEXT");
safeAlter("ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'pending'");
safeAlter("ALTER TABLE cartridges ADD COLUMN stock INTEGER DEFAULT 0");
safeAlter("ALTER TABLE cartridges ADD COLUMN brand TEXT");

console.log("✅ SQLite ready");

/* ===============================
   INVOICE NUMBER GENERATOR
   Format: ZWI-2026-0001
================================ */
function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const last = db.prepare(`
    SELECT invoice_number FROM orders
    WHERE invoice_number IS NOT NULL
    ORDER BY id DESC LIMIT 1
  `).get();
  let next = 1;
  if (last && last.invoice_number) {
    const parts = last.invoice_number.split('-');
    next = (parseInt(parts[2]) || 0) + 1;
  }
  return `ZWI-${year}-${String(next).padStart(4, '0')}`;
}

/* ===============================
   PDF INVOICE GENERATOR
================================ */
function generateInvoicePDF({ invoiceNumber, order, product, customer }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const buffers = [];
    doc.on('data', c => buffers.push(c));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const W = doc.page.width;
    const orange = '#f97316';
    const dark   = '#111827';
    const grey   = '#6b7280';
    const light  = '#f3f4f6';
    const cream  = '#fff7ed';

    /* --- header bar --- */
    doc.rect(0, 0, W, 85).fill(dark);
    doc.fill('white').font('Helvetica-Bold').fontSize(22)
       .text('ZWIITAVHATHU CARTRIDGES', 50, 22);
    doc.fill(orange).font('Helvetica').fontSize(11)
       .text('Your trusted printer cartridge supplier', 50, 50);
    doc.fill(orange).font('Helvetica-Bold').fontSize(30)
       .text('INVOICE', W - 170, 22, { width: 120, align: 'right' });

    /* --- invoice meta --- */
    const mt = 105;
    doc.fill(grey).font('Helvetica-Bold').fontSize(9).text('INVOICE NUMBER', 50, mt);
    doc.fill(dark).font('Helvetica').fontSize(11).text(invoiceNumber, 50, mt + 13);

    doc.fill(grey).font('Helvetica-Bold').fontSize(9).text('DATE', 200, mt);
    doc.fill(dark).font('Helvetica').fontSize(11)
       .text(new Date().toLocaleDateString('en-ZA',{year:'numeric',month:'long',day:'numeric'}), 200, mt + 13);

    doc.fill(grey).font('Helvetica-Bold').fontSize(9).text('STATUS', 380, mt);
    doc.fill(orange).font('Helvetica-Bold').fontSize(11).text('PENDING PAYMENT', 380, mt + 13);

    /* --- orange divider --- */
    doc.moveTo(50, mt + 38).lineTo(W - 50, mt + 38)
       .strokeColor(orange).lineWidth(2).stroke();

    /* --- bill to / from --- */
    const bt = mt + 55;
    doc.fill(grey).font('Helvetica-Bold').fontSize(9).text('BILL TO', 50, bt);
    doc.fill(dark).font('Helvetica-Bold').fontSize(13).text(customer.name, 50, bt + 13);
    doc.fill(grey).font('Helvetica').fontSize(10).text(customer.email, 50, bt + 30);
    if (customer.phone) doc.fill(grey).font('Helvetica').fontSize(10).text(customer.phone, 50, bt + 45);

    doc.fill(grey).font('Helvetica-Bold').fontSize(9).text('FROM', 370, bt);
    doc.fill(dark).font('Helvetica-Bold').fontSize(13).text('Zwiitavhathu Cartridges', 370, bt + 13);
    doc.fill(grey).font('Helvetica').fontSize(10).text('South Africa', 370, bt + 30);
    doc.fill(grey).font('Helvetica').fontSize(10).text(process.env.GOOGLE_EMAIL || '', 370, bt + 45);

    /* --- table header --- */
    const th = bt + 85;
    doc.rect(50, th, W - 100, 28).fill(dark);
    doc.fill('white').font('Helvetica-Bold').fontSize(9)
       .text('DESCRIPTION',  62, th + 10)
       .text('CODE',        290, th + 10)
       .text('QTY',         370, th + 10)
       .text('UNIT PRICE',  410, th + 10)
       .text('TOTAL',       500, th + 10);

    /* --- table row --- */
    const tr = th + 28;
    doc.rect(50, tr, W - 100, 34).fill(light);
    doc.fill(dark).font('Helvetica').fontSize(10)
       .text(product.name,                62, tr + 11, { width: 220 })
       .text(product.code || '–',        290, tr + 11)
       .text(String(order.quantity),      370, tr + 11)
       .text(`R${Number(product.price).toFixed(2)}`, 410, tr + 11)
       .text(`R${Number(order.total).toFixed(2)}`,   500, tr + 11);

    /* --- totals --- */
    const vat = order.total * 0.15;
    const grandTotal = order.total + vat;
    const tot = tr + 55;

    doc.fill(grey).font('Helvetica').fontSize(10).text('Subtotal', 370, tot);
    doc.fill(dark).font('Helvetica').fontSize(10).text(`R${order.total.toFixed(2)}`, 500, tot);

    doc.fill(grey).font('Helvetica').fontSize(10).text('VAT (15%)', 370, tot + 18);
    doc.fill(dark).font('Helvetica').fontSize(10).text(`R${vat.toFixed(2)}`, 500, tot + 18);

    doc.moveTo(370, tot + 38).lineTo(W - 50, tot + 38).strokeColor(orange).lineWidth(1.5).stroke();

    doc.fill(dark).font('Helvetica-Bold').fontSize(13).text('TOTAL DUE', 370, tot + 46);
    doc.fill(orange).font('Helvetica-Bold').fontSize(13).text(`R${grandTotal.toFixed(2)}`, 500, tot + 46);

    /* --- payment note --- */
    const pn = tot + 88;
    doc.rect(50, pn, W - 100, 52).fill(cream);
    doc.fill(orange).font('Helvetica-Bold').fontSize(10).text('PAYMENT INSTRUCTIONS', 65, pn + 10);
    doc.fill(dark).font('Helvetica').fontSize(9)
       .text(`Please use ${invoiceNumber} as your payment reference. We will confirm your order once payment is received.`,
             65, pn + 26, { width: W - 130 });

    /* --- footer --- */
    const fy = doc.page.height - 55;
    doc.rect(0, fy, W, 55).fill(dark);
    doc.fill(grey).font('Helvetica').fontSize(9)
       .text('Thank you for your business! | Zwiitavhathu Cartridges | South Africa',
             50, fy + 14, { align: 'center', width: W - 100 });
    doc.fill(orange).font('Helvetica-Bold').fontSize(9)
       .text(invoiceNumber, 50, fy + 32, { align: 'center', width: W - 100 });

    doc.end();
  });
}

/* ===============================
   GMAIL SETUP
================================ */
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

function encodeUTF8Base64(str) {
  return `=?UTF-8?B?${Buffer.from(str, 'utf-8').toString('base64')}?=`;
}

/* plain email */
async function sendMail({ subject, html, to }) {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const parts = [
    `From: "Zwiitavhathu Cartridges" <${process.env.GOOGLE_EMAIL}>`,
    `To: ${to || process.env.GOOGLE_EMAIL}`,
    `Subject: ${encodeUTF8Base64(subject)}`,
    'MIME-Version: 1.0','Content-Type: text/html; charset=utf-8','',html
  ];
  const raw = Buffer.from(parts.join('\n')).toString('base64')
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const r = await gmail.users.messages.send({ userId:'me', requestBody:{ raw } });
  console.log("📧 Email sent:", r.data.id);
}

/* email with PDF attachment */
async function sendMailWithPDF({ subject, html, to, pdfBuffer, pdfFilename }) {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const boundary = `zwii_${Date.now()}`;
  const pdfB64 = pdfBuffer.toString('base64');
  const parts = [
    `From: "Zwiitavhathu Cartridges" <${process.env.GOOGLE_EMAIL}>`,
    `To: ${to || process.env.GOOGLE_EMAIL}`,
    `Subject: ${encodeUTF8Base64(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${pdfFilename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${pdfFilename}"`,
    '',
    pdfB64,
    `--${boundary}--`
  ];
  const raw = Buffer.from(parts.join('\n')).toString('base64')
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const r = await gmail.users.messages.send({ userId:'me', requestBody:{ raw } });
  console.log("📧 PDF email sent:", r.data.id);
}

/* ===============================
   TEST EMAIL
================================ */
app.get('/test-email', async (req, res) => {
  try {
    await sendMail({ subject:"TEST – Zwiitavhathu", html:"<h1>Gmail works 🎉</h1>" });
    res.send("✅ Test email sent");
  } catch { res.status(500).send("❌ Failed"); }
});

/* ===============================
   IMPORT CARTRIDGES
================================ */
app.get('/api/import-cartridges', async (req, res) => {
  try {
    const filePath = path.join(__dirname, 'CARTRIDGE LIST FOR ZWIITABROTHERS Updated.docx');
    if (!fs.existsSync(filePath)) return res.status(400).json({ error:"File missing" });
    const result = await mammoth.extractRawText({ path: filePath });
    const lines = result.value.split('\n').map(l => l.trim()).filter(Boolean);
    const priceRx = /R\s*([\d,]+(?:\.\d+)?)/i;
    const codeRx  = /\b([A-Z]{1,4}\d{1,4}[A-Z0-9\-]*)\b/;
    db.exec("DELETE FROM cartridges");
    const ins = db.prepare(`INSERT INTO cartridges (name,description,price,image,code,is_query_only,stock) VALUES (?,?,?,?,?,?,?)`);
    let count = 0;
    for (const line of lines) {
      const pm = line.match(priceRx), cm = line.match(codeRx);
      const price = pm ? parseFloat(pm[1].replace(/,/g,'')) : null;
      const code  = cm ? cm[1] : null;
      const name  = line.replace(priceRx,'').replace(codeRx,'').trim();
      if (!name || name.length < 3) continue;
      ins.run(name, name, price, "default.jpg", code, price ? 0 : 1, 10);
      count++;
    }
    res.json({ success:true, imported:count });
  } catch (err) {
    console.error("❌ Import error:", err);
    res.status(500).json({ error:"Import failed" });
  }
});

/* ===============================
   GET PRODUCTS — public
================================ */
app.get('/api/cartridges', (req, res) => {
  try {
    const q = `%${(req.query.q||'').trim()}%`;
    const rows = db.prepare(`
      SELECT id,name,description,price,image,code,is_query_only,stock,brand
      FROM cartridges
      WHERE name IS NOT NULL AND trim(name)!=''
        AND (price IS NOT NULL OR is_query_only=1)
        AND (name LIKE ? OR code LIKE ?)
      ORDER BY name
    `).all(q, q);
    res.json(rows);
  } catch (err) { res.status(500).json({ error:"DB error" }); }
});

/* ===============================
   GET ALL PRODUCTS — admin
================================ */
app.get('/api/admin/cartridges', (req, res) => {
  try {
    const q = `%${(req.query.q||'').trim()}%`;
    const rows = db.prepare(`
      SELECT id,name,description,price,image,code,is_query_only,stock,brand
      FROM cartridges WHERE name LIKE ? OR code LIKE ? ORDER BY name
    `).all(q, q);
    res.json(rows);
  } catch (err) { res.status(500).json({ error:"DB error" }); }
});

/* ===============================
   ADD PRODUCT
================================ */
app.post('/api/cartridges', (req, res) => {
  try {
    const { name,code,brand,price,stock,image } = req.body;
    if (!name) return res.status(400).json({ error:"Name required" });
    const r = db.prepare(`INSERT INTO cartridges (name,description,price,image,code,brand,stock,is_query_only) VALUES (?,?,?,?,?,?,?,?)`)
      .run(name,name,price||null,image||'default.jpg',code||null,brand||null,stock??0,price?0:1);
    res.json({ success:true, id:r.lastInsertRowid });
  } catch (err) { res.status(500).json({ error:"Failed to add" }); }
});

/* ===============================
   EDIT PRODUCT
================================ */
app.put('/api/cartridges/:id', (req, res) => {
  try {
    const { name,code,brand,price,stock,image } = req.body;
    if (!name) return res.status(400).json({ error:"Name required" });
    db.prepare(`UPDATE cartridges SET name=?,description=?,code=?,brand=?,price=?,stock=?,image=?,is_query_only=? WHERE id=?`)
      .run(name,name,code||null,brand||null,price||null,stock??0,image||'default.jpg',price?0:1,req.params.id);
    res.json({ success:true });
  } catch (err) { res.status(500).json({ error:"Failed to edit" }); }
});

/* ===============================
   UPDATE STOCK
================================ */
app.patch('/api/cartridges/:id/stock', (req, res) => {
  try {
    const { stock,movement_type,quantity,note } = req.body;
    if (stock===undefined) return res.status(400).json({ error:"stock required" });
    db.prepare(`UPDATE cartridges SET stock=? WHERE id=?`).run(stock, req.params.id);
    if (movement_type && quantity) {
      const p = db.prepare("SELECT name FROM cartridges WHERE id=?").get(req.params.id);
      db.prepare(`INSERT INTO stock_log (product_id,product_name,movement_type,quantity,new_quantity,note) VALUES (?,?,?,?,?,?)`)
        .run(req.params.id, p?.name||'', movement_type, quantity, stock, note||'');
    }
    res.json({ success:true });
  } catch (err) { res.status(500).json({ error:"Failed to update stock" }); }
});

/* ===============================
   DELETE PRODUCT
================================ */
app.delete('/api/cartridges/:id', (req, res) => {
  try {
    db.prepare(`DELETE FROM cartridges WHERE id=?`).run(req.params.id);
    res.json({ success:true });
  } catch (err) { res.status(500).json({ error:"Failed to delete" }); }
});

/* ===============================
   STOCK LOG
================================ */
app.get('/api/stock-log', (req, res) => {
  try {
    res.json(db.prepare(`SELECT * FROM stock_log ORDER BY created_at DESC LIMIT 500`).all());
  } catch (err) { res.status(500).json({ error:"Failed" }); }
});

/* ===============================
   GET INVOICES — admin
================================ */
app.get('/api/invoices', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT o.id, o.invoice_number, o.customer_name, o.customer_email,
             o.customer_phone, o.quantity, o.total, o.payment_status, o.created_at,
             c.name AS product_name, c.price AS unit_price, c.code AS product_code
      FROM orders o
      LEFT JOIN cartridges c ON o.product_id = c.id
      ORDER BY o.created_at DESC
    `).all();
    res.json(rows);
  } catch (err) { res.status(500).json({ error:"Failed to fetch invoices" }); }
});

/* ===============================
   UPDATE PAYMENT STATUS
================================ */
app.patch('/api/invoices/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending','paid','cancelled'].includes(status))
      return res.status(400).json({ error:"Invalid status" });
    db.prepare(`UPDATE orders SET payment_status=? WHERE id=?`).run(status, req.params.id);
    res.json({ success:true });
  } catch (err) { res.status(500).json({ error:"Failed" }); }
});

/* ===============================
   DOWNLOAD INVOICE PDF
================================ */
app.get('/api/invoices/:id/pdf', async (req, res) => {
  try {
    const o = db.prepare(`
      SELECT o.*, c.name AS product_name, c.price, c.code
      FROM orders o LEFT JOIN cartridges c ON o.product_id=c.id
      WHERE o.id=?
    `).get(req.params.id);
    if (!o) return res.status(404).json({ error:"Not found" });
    const pdf = await generateInvoicePDF({
      invoiceNumber: o.invoice_number || `ZWI-${o.id}`,
      order: { quantity:o.quantity, total:o.total },
      product: { name:o.product_name, price:o.price, code:o.code },
      customer: { name:o.customer_name, email:o.customer_email, phone:o.customer_phone }
    });
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition',`attachment; filename="${o.invoice_number||'invoice'}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error("❌ PDF error:", err);
    res.status(500).json({ error:"Failed to generate PDF" });
  }
});

/* ===============================
   PLACE ORDER — with invoice PDF
================================ */
app.post('/api/order', async (req, res) => {
  try {
    const { name,email,phone,printerType,productId,quantity } = req.body;
    const product = db.prepare("SELECT * FROM cartridges WHERE id=?").get(productId);
    if (!product || product.is_query_only || product.price===null)
      return res.status(400).json({ error:"Price query required" });

    const total = product.price * quantity;
    const invoiceNumber = generateInvoiceNumber();

    db.prepare(`INSERT INTO orders (customer_name,customer_email,customer_phone,printer_type,product_id,quantity,total,invoice_number,payment_status) VALUES (?,?,?,?,?,?,?,?,'pending')`)
      .run(name,email,phone||'',printerType,productId,quantity,total,invoiceNumber);

    const newStock = Math.max(0,(product.stock??0) - quantity);
    db.prepare(`UPDATE cartridges SET stock=? WHERE id=?`).run(newStock, productId);
    db.prepare(`INSERT INTO stock_log (product_id,product_name,movement_type,quantity,new_quantity,note) VALUES (?,?,'out',?,?,'Customer order')`)
      .run(productId, product.name, quantity, newStock);

    const pdfBuffer = await generateInvoicePDF({
      invoiceNumber,
      order: { quantity, total },
      product: { name:product.name, price:product.price, code:product.code },
      customer: { name, email, phone }
    });

    const vat = total * 0.15;
    const grandTotal = (total + vat).toFixed(2);

    await sendMailWithPDF({
      subject: `Invoice ${invoiceNumber} – Zwiitavhathu Cartridges`,
      to: email,
      pdfBuffer,
      pdfFilename: `${invoiceNumber}.pdf`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#111827;padding:24px;border-radius:8px 8px 0 0">
            <h1 style="color:white;margin:0;font-size:20px">Zwiitavhathu Cartridges</h1>
            <p style="color:#f97316;margin:6px 0 0">Order Confirmed ✓</p>
          </div>
          <div style="background:#f9fafb;padding:24px;border-radius:0 0 8px 8px">
            <p>Hi <strong>${name}</strong>, thank you for your order!</p>
            <p>Your invoice <strong style="color:#f97316">${invoiceNumber}</strong> is attached as a PDF.</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
              <tr style="background:#111827;color:white">
                <th style="padding:10px;text-align:left">Product</th>
                <th style="padding:10px;text-align:center">Qty</th>
                <th style="padding:10px;text-align:right">Amount</th>
              </tr>
              <tr style="background:white">
                <td style="padding:10px;border-bottom:1px solid #e5e7eb">${product.name}</td>
                <td style="padding:10px;text-align:center;border-bottom:1px solid #e5e7eb">${quantity}</td>
                <td style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb">R${total.toFixed(2)}</td>
              </tr>
              <tr style="background:#f3f4f6">
                <td colspan="2" style="padding:10px;color:#6b7280">VAT (15%)</td>
                <td style="padding:10px;text-align:right;color:#6b7280">R${vat.toFixed(2)}</td>
              </tr>
              <tr style="background:#fff7ed">
                <td colspan="2" style="padding:10px;font-weight:bold">Total Due (incl. VAT)</td>
                <td style="padding:10px;text-align:right;font-weight:bold;color:#f97316">R${grandTotal}</td>
              </tr>
            </table>
            <p style="color:#6b7280;font-size:13px">Use <strong>${invoiceNumber}</strong> as your payment reference.</p>
            <p>Regards,<br><strong>Zwiitavhathu Cartridges</strong></p>
          </div>
        </div>
      `
    });

    await sendMailWithPDF({
      subject: `New Order ${invoiceNumber} – ${product.name}`,
      pdfBuffer,
      pdfFilename: `${invoiceNumber}.pdf`,
      html: `
        <h2>New Order Received</h2>
        <p><strong>Invoice:</strong> ${invoiceNumber}</p>
        <p><strong>Customer:</strong> ${name} | ${email} | ${phone||'N/A'}</p>
        <p><strong>Product:</strong> ${product.name} × ${quantity}</p>
        <p><strong>Total (excl. VAT):</strong> R${total.toFixed(2)}</p>
        <p><strong>Total (incl. VAT):</strong> R${grandTotal}</p>
        <p><strong>Remaining Stock:</strong> ${newStock}</p>
      `
    });

    res.json({ success:true, invoiceNumber });
  } catch (err) {
    console.error("❌ Order error:", err);
    res.status(500).json({ error:"Order failed" });
  }
});

/* ===============================
   PRICE QUERY
================================ */
app.post('/api/query', async (req, res) => {
  try {
    const { name,email,printerType,productId,notes } = req.body;
    const product = db.prepare("SELECT * FROM cartridges WHERE id=?").get(productId);
    if (!product) return res.status(400).json({ error:"Product not found" });
    await sendMail({
      subject:`Price Query – ${product.name}`,
      html:`<h2>Price Query</h2><p><b>Name:</b> ${name}</p><p><b>Email:</b> ${email}</p><p><b>Printer:</b> ${printerType}</p><p><b>Product:</b> ${product.name}</p><p><b>Notes:</b> ${notes||'None'}</p>`
    });
    res.json({ success:true });
  } catch (err) { res.status(500).json({ error:"Email failed" }); }
});

/* ===============================
   CARTRIDGE REQUEST
================================ */
app.post('/api/request-cartridge', async (req, res) => {
  try {
    const { name,email,printerType,requestedItem,notes } = req.body;
    if (!name||!email||!requestedItem) return res.status(400).json({ error:"Required fields missing" });
    db.prepare(`INSERT INTO cartridge_requests (customer_name,customer_email,printer_type,requested_item,notes) VALUES (?,?,?,?,?)`)
      .run(name, email, printerType||'', requestedItem, notes||'');
    await sendMail({
      subject:`Cartridge Request – ${requestedItem}`,
      html:`<h2>New Cartridge Request</h2><p><b>Name:</b> ${name}</p><p><b>Email:</b> ${email}</p><p><b>Printer:</b> ${printerType||'N/A'}</p><p><b>Item:</b> ${requestedItem}</p><p><b>Notes:</b> ${notes||'None'}</p>`
    });
    await sendMail({
      subject:`Request received – ${requestedItem}`,
      to: email,
      html:`<h2>Request Received</h2><p>Hi ${name},</p><p>Thank you for requesting <strong>${requestedItem}</strong>. We will contact you soon.</p><p>Regards,<br>Zwiitavhathu Cartridges</p>`
    });
    res.json({ success:true });
  } catch (err) { res.status(500).json({ error:"Request failed" }); }
});

/* ===============================
   ADMIN — protected
================================ */
app.use('/admin', basicAuth({
  users: { [process.env.ADMIN_USER]: process.env.ADMIN_PASS },
  challenge: true
}));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

/* ===============================
   PAGE ROUTES
================================ */
app.get('/',        (req,res) => res.sendFile(path.join(__dirname,'public','index.html')));
app.get('/products',(req,res) => res.sendFile(path.join(__dirname,'public','products.html')));
app.get('/about',   (req,res) => res.sendFile(path.join(__dirname,'public','about.html')));

/* ===============================
   START
================================ */
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
