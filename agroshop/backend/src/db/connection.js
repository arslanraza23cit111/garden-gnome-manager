import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "../..");

export const DATA_DIR = process.env.AGROSHOP_DATA_DIR || path.join(BACKEND_ROOT, "data");
export const DB_FILE = process.env.AGROSHOP_DB_FILE || path.join(DATA_DIR, "agroshop.db");

let db;

/** Opens (and migrates) the single local SQLite file. */
export function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  db.exec(schema);
  migrateUnits(db);
  migrateInvoiceNumberIndexes(db);
  return db;
}

function migrateInvoiceNumberIndexes(db) {
  for (const { table, index } of [
    { table: "purchases", index: "idx_purchases_invoice_number" },
    { table: "sales", index: "idx_sales_invoice_number" },
  ]) {
    const duplicates = db
      .prepare(
        `SELECT invoice_number, COUNT(*) AS c FROM ${table} GROUP BY invoice_number HAVING c > 1`,
      )
      .all();
    if (duplicates.length) {
      console.warn(
        `WARNING: duplicate invoice_number values found in ${table}. ` +
          `Unique index ${index} was skipped to avoid migration failure. ` +
          `Resolve duplicates manually before re-running this migration. ` +
          duplicates.map((r) => `${r.invoice_number} (${r.c})`).join(", "),
      );
      continue;
    }
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${index} ON ${table}(invoice_number)`);
  }
}

export function closeDb() {
  if (db) {
    db.close();
    db = undefined;
  }
}

/** Wraps a function so every statement inside runs in ONE atomic transaction. */
export function tx(fn) {
  return getDb().transaction(fn);
}

function hasColumn(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function addColumn(db, table, definition) {
  const column = definition.trim().split(/\s+/)[0];
  if (!hasColumn(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

function unitMigrationFactor(unit) {
  const u = String(unit || "").toLowerCase();
  const label = unit || "piece";
  if (["kg", "kilogram", "kilograms"].includes(u)) return { factor: 1, label };
  if (["g", "gram", "grams"].includes(u)) return { factor: 1, label };
  if (["litre", "liter", "litres", "liters", "l"].includes(u)) return { factor: 1, label };
  if (["ml", "millilitre", "milliliter", "millilitres", "milliliters"].includes(u))
    return { factor: 1, label };
  return { factor: 1, label };
}

function migrateUnits(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      unit_label TEXT NOT NULL,
      conversion_factor INTEGER NOT NULL,
      sale_price REAL NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  addColumn(db, "purchase_items", "unit_label TEXT");
  addColumn(db, "purchase_items", "conversion_factor INTEGER");
  addColumn(db, "purchase_items", "quantity_in_unit REAL");
  addColumn(db, "purchase_items", "quantity_base INTEGER");
  addColumn(db, "sale_items", "unit_label TEXT");
  addColumn(db, "sale_items", "conversion_factor INTEGER");
  addColumn(db, "sale_items", "quantity_in_unit REAL");
  addColumn(db, "sale_items", "quantity_base INTEGER");

  const products = db.prepare(`SELECT * FROM products`).all();
  for (const product of products) {
    const mapping = unitMigrationFactor(product.unit);
    const existing = db.prepare(`SELECT id FROM product_units WHERE product_id = ? LIMIT 1`).get(product.id);
    if (!existing) {
      db.prepare(
        `INSERT INTO product_units (product_id, unit_label, conversion_factor, sale_price, is_active, is_default)
         VALUES (?, ?, ?, ?, 1, 1)`,
      ).run(product.id, mapping.label, mapping.factor, product.sale_price ?? 0);
    } else {
      db.prepare(
        `UPDATE product_units
            SET conversion_factor = ?
          WHERE product_id = ?
            AND is_default = 1
            AND unit_label = ?
            AND conversion_factor <> ?`,
      ).run(mapping.factor, product.id, mapping.label, mapping.factor);
    }

    for (const table of ["purchase_items", "sale_items"]) {
      db.prepare(
        `UPDATE ${table}
            SET unit_label = COALESCE(unit_label, ?),
                conversion_factor = ?,
                quantity_in_unit = COALESCE(quantity_in_unit, quantity),
                quantity_base = ROUND(COALESCE(quantity_in_unit, quantity) * ?)
          WHERE product_id = ?
            AND (unit_label IS NULL OR unit_label = ?)`,
      ).run(mapping.label, mapping.factor, mapping.factor, product.id, mapping.label);
    }
  }
}
