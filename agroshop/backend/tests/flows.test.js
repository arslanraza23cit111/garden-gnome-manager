/**
 * Integration tests for the non-negotiable business rules.
 * Runs against a throwaway SQLite file — never touches data/agroshop.db.
 *
 *   npm test
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = path.join(os.tmpdir(), `agroshop-test-${Date.now()}.db`);
process.env.AGROSHOP_DB_FILE = tmp;

const { createApp } = await import("../src/app.js");
const { getDb } = await import("../src/db/connection.js");
const { hashPassword } = await import("../src/lib/auth.js");

let server;
let base;
let token;

const today = new Date().toISOString().slice(0, 10);

async function call(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}
const post = (p, b) => call("POST", p, b);
const get = (p) => call("GET", p);

const stockOf = (productId) =>
  getDb().prepare(`SELECT COALESCE(SUM(quantity),0) q FROM product_batches WHERE product_id = ?`).get(productId).q;
const bal = (type, ref) =>
  getDb()
    .prepare(
      `SELECT COALESCE(SUM(debit),0) - COALESCE(SUM(credit),0) b FROM ledger_entries
        WHERE account_type = ? AND (? IS NULL OR account_ref_id = ?)`,
    )
    .get(type, ref ?? null, ref ?? null).b;

before(async () => {
  const db = getDb();
  db.prepare(`INSERT INTO users (username, password_hash, full_name) VALUES ('admin', ?, 'Test')`).run(
    hashPassword("admin123"),
  );
  db.prepare(
    `INSERT INTO products (name, unit, purchase_price, sale_price, min_stock_level)
     VALUES ('Urea', 'bag', 100, 130, 5)`,
  ).run();
  db.prepare(`INSERT INTO customers (name, customer_type) VALUES ('Test Farmer', 'farmer')`).run();
  db.prepare(`INSERT INTO suppliers (name) VALUES ('Test Supplier')`).run();

  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
  const login = await post("/auth/login", { username: "admin", password: "admin123" });
  token = login.body.token;
});

after(() => {
  server?.close();
  for (const f of [tmp, `${tmp}-wal`, `${tmp}-shm`]) if (fs.existsSync(f)) fs.rmSync(f);
});

test("auth is required", async () => {
  const res = await fetch(`${base}/products`);
  assert.equal(res.status, 401);
});

test("purchase increases stock and supplier payable", async () => {
  const before = stockOf(1);
  const r = await post("/purchases", {
    supplier_id: 1,
    date: today,
    paid_amount: 2000,
    payment_method: "cash",
    items: [{ product_id: 1, batch_number: "B1", expiry_date: "2030-01-01", quantity: 100, rate: 100 }],
  });
  assert.equal(r.status, 201);
  assert.equal(stockOf(1), before + 100);
  // total 10000, paid 2000 -> payable 8000 (credit balance), cash -2000
  assert.equal(bal("supplier", 1), -8000);
  assert.equal(bal("cash"), -2000);
});

test("sale decreases stock and raises customer receivable", async () => {
  const before = stockOf(1);
  const r = await post("/sales", {
    customer_id: 1,
    date: today,
    paid_amount: 1000,
    payment_method: "cash",
    items: [{ product_id: 1, quantity: 10, rate: 130 }],
  });
  assert.equal(r.status, 201);
  assert.equal(stockOf(1), before - 10);
  // total 1300, paid 1000 -> customer owes 300
  assert.equal(bal("customer", 1), 300);
});

test("selling more than available stock is rejected and writes nothing", async () => {
  const beforeStock = stockOf(1);
  const beforeSales = getDb().prepare(`SELECT COUNT(*) c FROM sales`).get().c;
  const r = await post("/sales", {
    customer_id: 1,
    date: today,
    paid_amount: 0,
    items: [{ product_id: 1, quantity: 99999, rate: 130 }],
  });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Not enough stock/);
  assert.equal(stockOf(1), beforeStock);
  assert.equal(getDb().prepare(`SELECT COUNT(*) c FROM sales`).get().c, beforeSales);
});

test("a failed line rolls the whole sale back (atomicity)", async () => {
  const beforeStock = stockOf(1);
  const beforeItems = getDb().prepare(`SELECT COUNT(*) c FROM sale_items`).get().c;
  const r = await post("/sales", {
    customer_id: 1,
    date: today,
    paid_amount: 0,
    items: [
      { product_id: 1, quantity: 5, rate: 130 },
      { product_id: 1, quantity: 999999, rate: 130 },
    ],
  });
  assert.equal(r.status, 400);
  assert.equal(stockOf(1), beforeStock, "stock must be untouched");
  assert.equal(getDb().prepare(`SELECT COUNT(*) c FROM sale_items`).get().c, beforeItems);
});

test("FEFO consumes the nearest-expiry batch first", async () => {
  await post("/purchases", {
    supplier_id: 1,
    date: today,
    paid_amount: 0,
    items: [{ product_id: 1, batch_number: "SOON", expiry_date: "2026-01-01", quantity: 5, rate: 90 }],
  });
  await post("/sales", {
    customer_id: 1,
    date: today,
    paid_amount: 0,
    items: [{ product_id: 1, quantity: 5, rate: 130 }],
  });
  const soon = getDb().prepare(`SELECT quantity FROM product_batches WHERE batch_number = 'SOON'`).get();
  assert.equal(soon.quantity, 0, "nearest-expiry batch should be emptied first");
});

test("ledger is always balanced overall", async () => {
  const row = getDb()
    .prepare(`SELECT ROUND(SUM(debit),2) d, ROUND(SUM(credit),2) c FROM ledger_entries`)
    .get();
  assert.equal(row.d, row.c);
});

test("validation blocks empty and negative input", async () => {
  assert.equal((await post("/products", { name: "", unit: "bag" })).status, 400);
  assert.equal((await post("/products", { name: "X", unit: "bag", sale_price: -5 })).status, 400);
  assert.equal((await post("/sales", { customer_id: 1, items: [] })).status, 400);
  const over = await post("/sales", {
    customer_id: 1,
    paid_amount: 999999,
    items: [{ product_id: 1, quantity: 1, rate: 130 }],
  });
  assert.equal(over.status, 400);
});

test("dashboard totals come back", async () => {
  const r = await get("/dashboard");
  assert.equal(r.status, 200);
  assert.ok(r.body.stock_value >= 0);
  assert.ok("cash_in_hand" in r.body);
});
