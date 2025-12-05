const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const mammoth = require('mammoth');

const db = new sqlite3.Database('./database.db');

async function importCartridges() {
  const filePath = path.join(__dirname, 'CARTRIDGE LIST FOR ZWIITABROTHERS Updated.docx');
  const { value } = await mammoth.extractRawText({ path: filePath });

  const lines = value.split('\n').map(l => l.trim()).filter(l => l);

  const insertStmt = db.prepare("INSERT INTO cartridges (name, description, price, image) VALUES (?, ?, ?, ?)");

  const defaultImage = 'default.jpg'; // one image for all products

  for (let line of lines) {
    // Look for something like: "HP 652 Black - R250" or "Canon 445XL"
    const match = line.match(/(.+?)\s*[-–]?\s*(R\d+)?/i);
    if (!match) continue;

    const name = match[1].trim();
    const price = match[2] ? parseFloat(match[2].replace(/[^\d.]/g, '')) : null;
    const description = price ? "Available for direct order." : "Price not listed — customer can request a quote.";

    insertStmt.run(name, description, price, defaultImage);
  }

  insertStmt.finalize();
  console.log("✅ Cartridges imported successfully!");
  db.close();
}

importCartridges().catch(err => console.error("❌ Error importing:", err));
