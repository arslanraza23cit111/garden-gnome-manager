/**
 * stockService — the ONLY place that writes product_batches.quantity.
 * Stock is batch + expiry level. Never a single total on products.
 */
import { getDb } from "../db/connection.js";

const norm = (v) => (v === undefined || v === null || v === "" ? null : String(v));

function findBatch(product_id, batch_number, expiry_date) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM product_batches
        WHERE product_id = ? AND batch_number = ?
          AND (expiry_date IS ? OR expiry_date = ?)`,
    )
    .get(product_id, batch_number || "-", norm(expiry_date), norm(expiry_date));
}

/** Purchase / sale-return: add stock into a specific batch (creates it if new). */
export function increaseStock({ product_id, batch_number, expiry_date, quantity, rate }) {
  const db = getDb();
  if (!(quantity > 0)) throw new Error("Quantity must be greater than zero");
  const bn = batch_number || "-";
  const existing = findBatch(product_id, bn, expiry_date);
  if (existing) {
    db.prepare(`UPDATE product_batches SET quantity = quantity + ?, purchase_rate = ? WHERE id = ?`).run(
      quantity,
      rate ?? existing.purchase_rate,
      existing.id,
    );
    return existing.id;
  }
  const info = db
    .prepare(
      `INSERT INTO product_batches (product_id, batch_number, expiry_date, quantity, purchase_rate)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(product_id, bn, norm(expiry_date), quantity, rate ?? 0);
  return info.lastInsertRowid;
}

/** Restore stock for a sale return by preferring the original batch/expiry and falling back to a matching batch. */
export function restoreStock({ product_id, batch_number, expiry_date, quantity, rate }) {
  const db = getDb();
  if (!(quantity > 0)) throw new Error("Quantity must be greater than zero");
  const bn = batch_number || "-";
  const exact = findBatch(product_id, bn, expiry_date);
  if (exact) {
    db.prepare(`UPDATE product_batches SET quantity = quantity + ?, purchase_rate = ? WHERE id = ?`).run(
      quantity,
      rate ?? exact.purchase_rate,
      exact.id,
    );
    return exact.id;
  }

  const sameExpiry = expiry_date
    ? db
        .prepare(`SELECT * FROM product_batches WHERE product_id = ? AND expiry_date = ? ORDER BY id DESC LIMIT 1`)
        .get(product_id, norm(expiry_date))
    : null;
  if (sameExpiry) {
    db.prepare(`UPDATE product_batches SET quantity = quantity + ?, purchase_rate = ? WHERE id = ?`).run(
      quantity,
      rate ?? sameExpiry.purchase_rate,
      sameExpiry.id,
    );
    return sameExpiry.id;
  }

  const sameBatch = batch_number
    ? db.prepare(`SELECT * FROM product_batches WHERE product_id = ? AND batch_number = ? ORDER BY id DESC LIMIT 1`).get(product_id, bn)
    : null;
  if (sameBatch) {
    db.prepare(`UPDATE product_batches SET quantity = quantity + ?, purchase_rate = ? WHERE id = ?`).run(
      quantity,
      rate ?? sameBatch.purchase_rate,
      sameBatch.id,
    );
    return sameBatch.id;
  }

  return increaseStock({ product_id, batch_number: bn, expiry_date, quantity, rate });
}

/** Purchase-return: remove stock from one named batch. Rejects if insufficient. */
export function decreaseStockFromBatch({ product_id, batch_number, expiry_date, quantity }) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM product_batches WHERE product_id = ? AND batch_number = ?
        AND (expiry_date IS ? OR expiry_date = ?)
        ORDER BY quantity DESC LIMIT 1`,
    )
    .get(product_id, batch_number || "-", norm(expiry_date), norm(expiry_date));
  if (!row) throw new Error(`No stock found for batch ${batch_number}`);
  if (row.quantity < quantity)
    throw new Error(`Insufficient stock in batch ${batch_number}: have ${row.quantity}, need ${quantity}`);
  db.prepare(`UPDATE product_batches SET quantity = quantity - ? WHERE id = ?`).run(quantity, row.id);
  return [{ batch_id: row.id, batch_number: row.batch_number, quantity, cost_rate: row.purchase_rate }];
}

/**
 * Sale: consume stock FEFO (first-expired-first-out) across batches.
 * Returns the allocation so the caller can write one sale_item per batch used.
 * Throws before writing anything if total available stock is short.
 */
export function decreaseStockFEFO({ product_id, quantity, allowNegative = false }) {
  const db = getDb();
  const batches = db
    .prepare(
      `SELECT * FROM product_batches WHERE product_id = ? AND quantity > 0
        ORDER BY (expiry_date IS NULL), expiry_date ASC, id ASC`,
    )
    .all(product_id);
  const available = batches.reduce((s, b) => s + b.quantity, 0);
  if (available < quantity && !allowNegative) {
    const p = db.prepare(`SELECT name FROM products WHERE id = ?`).get(product_id);
    throw new Error(
      `Insufficient stock for ${p?.name ?? "product"}: available ${available}, requested ${quantity}`,
    );
  }

  const allocation = [];
  let remaining = quantity;
  for (const b of batches) {
    if (remaining <= 0) break;
    const take = Math.min(b.quantity, remaining);
    db.prepare(`UPDATE product_batches SET quantity = quantity - ? WHERE id = ?`).run(take, b.id);
    allocation.push({
      batch_id: b.id,
      batch_number: b.batch_number,
      expiry_date: b.expiry_date,
      quantity: take,
      cost_rate: b.purchase_rate,
    });
    remaining -= take;
  }
  if (remaining > 0 && allowNegative) {
    const id = increaseStock({ product_id, batch_number: "-", expiry_date: null, quantity: 0 });
    getDb().prepare(`UPDATE product_batches SET quantity = quantity - ? WHERE id = ?`).run(remaining, id);
    allocation.push({ batch_id: id, batch_number: "-", quantity: remaining, cost_rate: 0 });
  }
  return allocation;
}

/** Current stock per product, aggregated from batches. */
export function stockByProduct() {
  return getDb()
    .prepare(
      `SELECT p.*,
              COALESCE(SUM(b.quantity), 0)                AS current_stock,
              COALESCE(SUM(b.quantity * b.purchase_rate), 0) AS stock_value
         FROM products p
         LEFT JOIN product_batches b ON b.product_id = p.id
        GROUP BY p.id
        ORDER BY p.name`,
    )
    .all();
}

export function batchesForProduct(product_id) {
  return getDb()
    .prepare(
      `SELECT * FROM product_batches WHERE product_id = ?
        ORDER BY (expiry_date IS NULL), expiry_date ASC`,
    )
    .all(product_id);
}

export function totalStockValue() {
  return (
    getDb().prepare(`SELECT COALESCE(SUM(quantity * purchase_rate), 0) AS v FROM product_batches`).get().v ?? 0
  );
}
