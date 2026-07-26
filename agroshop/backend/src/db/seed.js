/**
 * Demo/seed data. Master data is inserted directly; transactions go through the
 * real API so stock + ledgers are built by the same code the app uses.
 *
 *   npm run seed            (adds demo data)
 *   npm run seed -- --reset (wipes the db file first)
 */
import fs from "node:fs";
import { getDb, DB_FILE } from "./connection.js";
import { hashPassword } from "../lib/auth.js";
import { createApp } from "../app.js";

const reset = process.argv.includes("--reset");
if (reset) {
  for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) {
    if (fs.existsSync(f)) fs.rmSync(f);
  }
  console.log("Removed existing database file.");
}

const db = getDb();
const d = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

// ---- settings + admin user -------------------------------------------------
const setting = db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`);
setting.run("shop_name", "Al-Falah Agri Traders");
setting.run("shop_address", "Main Bazaar Road, Chichawatni, Sahiwal");
setting.run("shop_phone", "0301-2345678");
setting.run("shop_tagline", "Fertilizers • Pesticides • Seeds");
setting.run("currency", "PKR");
setting.run("print_mode", "a4");

if (!db.prepare(`SELECT 1 FROM users WHERE username = 'admin'`).get()) {
  db.prepare(
    `INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, 'admin')`,
  ).run("admin", hashPassword("admin123"), "Shop Owner");
  console.log("Created admin user  →  admin / admin123");
}

if (db.prepare(`SELECT COUNT(*) c FROM products`).get().c > 0) {
  console.log("Demo data already present — skipping. Use `npm run seed -- --reset` to rebuild.");
  process.exit(0);
}

// ---- products --------------------------------------------------------------
const productRows = [
  ["Urea 46%", "Fauji Fertilizer", "Fertilizer", "Granular", "bag", "50 kg", 4300, 4550, 4600, 4500, 20],
  ["DAP", "Engro", "Fertilizer", "Granular", "bag", "50 kg", 11200, 11800, 11900, 11700, 15],
  ["SOP Potash", "FFC", "Fertilizer", "Granular", "bag", "50 kg", 12500, 13200, 13300, 13100, 10],
  ["Confidor 200 SL", "Bayer", "Pesticide", "Insecticide", "bottle", "250 ml", 1850, 2100, 2150, 2050, 12],
  ["Karate 2.5 EC", "Syngenta", "Pesticide", "Insecticide", "bottle", "500 ml", 1450, 1690, 1720, 1650, 12],
  ["Topsin-M", "Ali Akbar", "Pesticide", "Fungicide", "packet", "500 g", 980, 1150, 1180, 1120, 10],
  ["Zinc Sulphate 33%", "Sarsabz", "Micronutrient", "Powder", "kg", "1 kg", 420, 520, 540, 500, 25],
  ["Boron 20%", "Agri Care", "Micronutrient", "Powder", "packet", "1 kg", 780, 940, 960, 920, 10],
  ["Round Up", "Monsanto", "Pesticide", "Herbicide", "litre", "1 L", 1650, 1900, 1950, 1870, 8],
  ["Hybrid Maize Seed", "Pioneer", "Seed", "Maize", "bag", "10 kg", 7800, 8600, 8700, 8500, 6],
];
const insertProduct = db.prepare(
  `INSERT INTO products (name, company, category, type, unit, packing_size,
     purchase_price, sale_price, retail_price, wholesale_price, min_stock_level)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
for (const r of productRows) insertProduct.run(...r);

// ---- customers -------------------------------------------------------------
const customerRows = [
  ["Muhammad Aslam", "Ghulam Rasool", "3520112345671", "0300-1112233", "Chak 42/12-L", "Chichawatni", "farmer", 200000],
  ["Rana Zubair", "Rana Karim", "3520198765432", "0321-4455667", "Adda Kassowal", "Kassowal", "dealer", 500000],
  ["Ijaz Ahmad", "Nazir Ahmad", null, "0333-9988776", "Chak 88/15-L", "Mian Channu", "farmer", 150000],
  ["Haji Sarfraz", "Allah Ditta", null, "0345-1234567", "Basti Malook", "Sahiwal", "farmer", 100000],
  ["Walk-in Customer", null, null, null, null, null, "walk-in", 0],
];
const insertCustomer = db.prepare(
  `INSERT INTO customers (name, father_name, cnic, mobile, address, area, customer_type, credit_limit, opening_balance)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
);
for (const r of customerRows) insertCustomer.run(...r);

// ---- suppliers -------------------------------------------------------------
const supplierRows = [
  ["Fauji Fertilizer Dealer", "FFC", "042-35678901", "Multan Road, Lahore"],
  ["Engro Distributor", "Engro Fertilizers", "061-4567890", "Vehari Road, Multan"],
  ["Bayer Crop Science Agency", "Bayer", "042-11223344", "Gulberg III, Lahore"],
  ["Ali Akbar Group Agency", "Ali Akbar", "041-2233445", "Sargodha Road, Faisalabad"],
];
const insertSupplier = db.prepare(
  `INSERT INTO suppliers (name, company, contact, address, opening_balance) VALUES (?, ?, ?, ?, 0)`,
);
for (const r of supplierRows) insertSupplier.run(...r);

// ---- opening cash & bank (owner's capital) --------------------------------
// Cash and bank balances are ledger-derived, so opening money is a ledger entry.
const openingLedger = db.prepare(
  `INSERT INTO ledger_entries (date, account_type, account_ref_id, debit, credit, source_type, description)
   VALUES (?, ?, NULL, ?, ?, 'opening', ?)`,
);
openingLedger.run(d(-30), "cash", 400000, 0, "Opening cash in hand");
openingLedger.run(d(-30), "bank", 1500000, 0, "Opening bank balance");
openingLedger.run(d(-30), "capital", 0, 1900000, "Owner's capital");

// ---- transactions through the real API ------------------------------------

const server = createApp().listen(0);
const port = server.address().port;
const base = `http://127.0.0.1:${port}/api`;

const login = await (
  await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  })
).json();

async function api(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path}: ${json.error}`);
  return json;
}

await api("/purchases", {
  supplier_id: 1,
  date: d(-20),
  paid_amount: 300000,
  payment_method: "bank",
  items: [
    { product_id: 1, batch_number: "URE-2401", expiry_date: null, quantity: 120, rate: 4300 },
    { product_id: 7, batch_number: "ZN-2402", expiry_date: d(400), quantity: 80, rate: 420 },
  ],
});

await api("/purchases", {
  supplier_id: 2,
  date: d(-15),
  paid_amount: 0,
  payment_method: "credit",
  items: [
    { product_id: 2, batch_number: "DAP-2403", expiry_date: null, quantity: 60, rate: 11200 },
    { product_id: 3, batch_number: "SOP-2403", expiry_date: null, quantity: 25, rate: 12500 },
  ],
});

await api("/purchases", {
  supplier_id: 3,
  date: d(-10),
  paid_amount: 100000,
  payment_method: "cash",
  items: [
    { product_id: 4, batch_number: "CNF-A19", expiry_date: d(45), quantity: 40, rate: 1850 },
    { product_id: 5, batch_number: "KRT-B22", expiry_date: d(300), quantity: 35, rate: 1450 },
    { product_id: 9, batch_number: "RU-9081", expiry_date: d(500), quantity: 30, rate: 1650 },
  ],
});

await api("/purchases", {
  supplier_id: 4,
  date: d(-6),
  paid_amount: 40000,
  payment_method: "cash",
  items: [
    { product_id: 6, batch_number: "TSM-551", expiry_date: d(20), quantity: 25, rate: 980 },
    { product_id: 8, batch_number: "BOR-77", expiry_date: d(600), quantity: 20, rate: 780 },
    { product_id: 10, batch_number: "MZ-31R", expiry_date: d(365), quantity: 15, rate: 7800 },
  ],
});

await api("/sales", {
  customer_id: 1,
  date: d(-4),
  paid_amount: 50000,
  payment_method: "cash",
  items: [
    { product_id: 1, quantity: 20, rate: 4550 },
    { product_id: 4, quantity: 4, rate: 2100 },
  ],
});

await api("/sales", {
  customer_id: 2,
  date: d(-2),
  paid_amount: 200000,
  payment_method: "bank",
  items: [
    { product_id: 2, quantity: 20, rate: 11800 },
    { product_id: 3, quantity: 5, rate: 13200 },
  ],
});

await api("/sales", {
  customer_id: 3,
  date: d(0),
  paid_amount: 0,
  payment_method: "credit",
  items: [
    { product_id: 5, quantity: 6, rate: 1690 },
    { product_id: 7, quantity: 10, rate: 520 },
  ],
});

await api("/sales", {
  customer_id: 5,
  date: d(0),
  paid_amount: 11030,
  payment_method: "cash",
  items: [
    { product_id: 6, quantity: 4, rate: 1150 },
    { product_id: 8, quantity: 2, rate: 940 },
    { product_id: 1, quantity: 1, rate: 4550 },
  ],
});

server.close();
console.log("Demo data ready: 10 products, 5 customers, 4 suppliers, 4 purchases, 4 sales.");
console.log(`Database: ${DB_FILE}`);
console.log("Login with  admin / admin123");
