<<<<<<< HEAD
-- =========================================
-- 🖨️  Zwiitavhathu Cartridges – SQL Import
-- =========================================

-- Ensure table exists
CREATE TABLE IF NOT EXISTS cartridges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    description TEXT,
    price REAL,
    image TEXT DEFAULT 'default.jpg',
    is_query_only INTEGER DEFAULT 0
);

-- Clear existing data (optional)
DELETE FROM cartridges;

-- ===========================
-- 💰 Cartridges WITH prices
-- ===========================
INSERT INTO cartridges (name, description, price, image, is_query_only) VALUES
('HP M604 M605 Compatible Black Toner Cartridge 2Pack 81A', '', 800, 'default.jpg', 0),
('HP CF289A Generic 2-Pack Toners Cartridge 89A', '', 1200, 'default.jpg', 0),
('HP CF230A Compatible Toner Cartridge 30A (2-Pack)', '', 1000, 'default.jpg', 0),
('HP 410A Compatible Laser Toner Cartridge Combo Pack (CF410A-CF413A)', '', 1600, 'default.jpg', 0),
('HP 78A Compatible Black Toner Cartridge', '', 750, 'default.jpg', 0),
('Canon 445XL High Yield Black Ink Cartridge', '', 300, 'default.jpg', 0),
('Epson 664 Cyan Ink Bottle for EcoTank', '', 200, 'default.jpg', 0);

-- ===========================
-- ❓ Cartridges WITHOUT prices (query-only)
-- ===========================
INSERT INTO cartridges (name, description, price, image, is_query_only) VALUES
('HP 207A Color LaserJet Cartridge (Cyan)', '', NULL, 'default.jpg', 1),
('Canon PG-445 Black Standard Yield Ink Cartridge', '', NULL, 'default.jpg', 1),
('Brother TN-1070 Monochrome Toner Cartridge', '', NULL, 'default.jpg', 1),
('Epson T664 Magenta Ink Bottle for EcoTank', '', NULL, 'default.jpg', 1);
=======
-- =========================================
-- 🖨️  Zwiitavhathu Cartridges – SQL Import
-- =========================================

-- Ensure table exists
CREATE TABLE IF NOT EXISTS cartridges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    description TEXT,
    price REAL,
    image TEXT DEFAULT 'default.jpg',
    is_query_only INTEGER DEFAULT 0
);

-- Clear existing data (optional)
DELETE FROM cartridges;

-- ===========================
-- 💰 Cartridges WITH prices
-- ===========================
INSERT INTO cartridges (name, description, price, image, is_query_only) VALUES
('HP M604 M605 Compatible Black Toner Cartridge 2Pack 81A', '', 800, 'default.jpg', 0),
('HP CF289A Generic 2-Pack Toners Cartridge 89A', '', 1200, 'default.jpg', 0),
('HP CF230A Compatible Toner Cartridge 30A (2-Pack)', '', 1000, 'default.jpg', 0),
('HP 410A Compatible Laser Toner Cartridge Combo Pack (CF410A-CF413A)', '', 1600, 'default.jpg', 0),
('HP 78A Compatible Black Toner Cartridge', '', 750, 'default.jpg', 0),
('Canon 445XL High Yield Black Ink Cartridge', '', 300, 'default.jpg', 0),
('Epson 664 Cyan Ink Bottle for EcoTank', '', 200, 'default.jpg', 0);

-- ===========================
-- ❓ Cartridges WITHOUT prices (query-only)
-- ===========================
INSERT INTO cartridges (name, description, price, image, is_query_only) VALUES
('HP 207A Color LaserJet Cartridge (Cyan)', '', NULL, 'default.jpg', 1),
('Canon PG-445 Black Standard Yield Ink Cartridge', '', NULL, 'default.jpg', 1),
('Brother TN-1070 Monochrome Toner Cartridge', '', NULL, 'default.jpg', 1),
('Epson T664 Magenta Ink Bottle for EcoTank', '', NULL, 'default.jpg', 1);
>>>>>>> 073f25624de62b5ba46a1884c66c76c40184f50d
