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
const { getDb, closeDb } = await import("../src/db/connection.js");
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
const createProduct = (name, unit = "piece", purchasePrice = 10, salePrice = 15) => {
  const info = getDb()
    .prepare(`INSERT INTO products (name, unit, purchase_price, sale_price, min_stock_level) VALUES (?, ?, ?, ?, 0)`)
    .run(name, unit, purchasePrice, salePrice);
  return Number(info.lastInsertRowid);
};

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
  closeDb();
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

test("purchasing 2 large units adds their exact base quantity", async () => {
  const productId = createProduct("Bagged Urea Multi", "g", 4000, 4500);
  const unit = await post(`/products/${productId}/units`, {
    unit_label: "50kg bag",
    conversion_factor: 50000,
    sale_price: 4500,
    is_default: true,
  });
  assert.equal(unit.status, 201);

  const before = stockOf(productId);
  const purchase = await post("/purchases", {
    supplier_id: 1,
    date: today,
    paid_amount: 0,
    items: [
      {
        product_id: productId,
        product_unit_id: unit.body.id,
        quantity_in_unit: 2,
        batch_number: "MU-BAG",
        expiry_date: "2030-01-01",
        rate: 4000,
      },
    ],
  });
  assert.equal(purchase.status, 201);
  assert.equal(stockOf(productId), before + 100000);
  const item = getDb().prepare(`SELECT * FROM purchase_items WHERE purchase_id = ?`).get(purchase.body.id);
  assert.equal(item.unit_label, "50kg bag");
  assert.equal(item.conversion_factor, 50000);
  assert.equal(item.quantity_in_unit, 2);
  assert.equal(item.quantity_base, 100000);
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

test("selling loose units deducts exact base quantity and rejects over-selling", async () => {
  const productId = createProduct("Loose Urea Multi", "g", 80, 120);
  const unit = await post(`/products/${productId}/units`, {
    unit_label: "1kg loose",
    conversion_factor: 1000,
    sale_price: 120,
    is_default: true,
  });
  assert.equal(unit.status, 201);
  await post("/purchases", {
    supplier_id: 1,
    date: today,
    paid_amount: 0,
    items: [
      {
        product_id: productId,
        product_unit_id: unit.body.id,
        quantity_in_unit: 2,
        batch_number: "MU-LOOSE",
        expiry_date: "2030-01-01",
        rate: 80,
      },
    ],
  });

  const before = stockOf(productId);
  const sale = await post("/sales", {
    customer_id: 1,
    date: today,
    paid_amount: 0,
    items: [{ product_id: productId, product_unit_id: unit.body.id, quantity_in_unit: 1, rate: 120 }],
  });
  assert.equal(sale.status, 201);
  assert.equal(stockOf(productId), before - 1000);
  const item = getDb().prepare(`SELECT * FROM sale_items WHERE sale_id = ?`).get(sale.body.id);
  assert.equal(item.unit_label, "1kg loose");
  assert.equal(item.conversion_factor, 1000);
  assert.equal(item.quantity_in_unit, 1);
  assert.equal(item.quantity_base, 1000);

  const reject = await post("/sales", {
    customer_id: 1,
    date: today,
    paid_amount: 0,
    items: [{ product_id: productId, product_unit_id: unit.body.id, quantity_in_unit: 2, rate: 120 }],
  });
  assert.equal(reject.status, 400);
  assert.match(reject.body.error, /Not enough stock/);
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

test("purchase return decreases stock and reduces supplier payable", async () => {
  const purchase = await post("/purchases", {
    supplier_id: 1,
    date: today,
    paid_amount: 0,
    items: [{ product_id: 1, batch_number: "RET-1", expiry_date: "2030-01-01", quantity: 20, rate: 100 }],
  });
  assert.equal(purchase.status, 201);
  const beforeStock = stockOf(1);
  const beforePayable = bal("supplier", 1);
  const purchaseItemId = getDb().prepare(`SELECT id FROM purchase_items WHERE purchase_id = ? ORDER BY id LIMIT 1`).get(purchase.body.id).id;
  const r = await post("/purchase-returns", {
    purchase_id: purchase.body.id,
    date: today,
    reason: "Damaged goods",
    items: [{ purchase_item_id: purchaseItemId, quantity: 5 }],
  });
  assert.equal(r.status, 201);
  assert.equal(stockOf(1), beforeStock - 5);
  assert.equal(bal("supplier", 1), beforePayable + 500);
});

test("purchase return reverses the original item snapshot base quantity", async () => {
  const productId = createProduct("Return Snapshot Urea", "g", 3000, 3600);
  const unit = await post(`/products/${productId}/units`, {
    unit_label: "50kg bag",
    conversion_factor: 50000,
    sale_price: 3600,
    is_default: true,
  });
  const purchase = await post("/purchases", {
    supplier_id: 1,
    date: today,
    paid_amount: 0,
    items: [
      {
        product_id: productId,
        product_unit_id: unit.body.id,
        quantity_in_unit: 2,
        batch_number: "SNAP-RET",
        expiry_date: "2030-01-01",
        rate: 3000,
      },
    ],
  });
  assert.equal(purchase.status, 201);
  const purchaseItem = getDb().prepare(`SELECT * FROM purchase_items WHERE purchase_id = ?`).get(purchase.body.id);
  assert.equal(purchaseItem.quantity_base, 100000);
  getDb().prepare(`UPDATE product_units SET conversion_factor = 25000, is_active = 0 WHERE id = ?`).run(unit.body.id);

  const before = stockOf(productId);
  const returned = await post("/purchase-returns", {
    purchase_id: purchase.body.id,
    date: today,
    reason: "Packaging changed after purchase",
    items: [{ purchase_item_id: purchaseItem.id, quantity: 2 }],
  });
  assert.equal(returned.status, 201);
  assert.equal(stockOf(productId), before - purchaseItem.quantity_base);
});

test("sale return increases stock and reduces customer outstanding", async () => {
  const sale = await post("/sales", {
    customer_id: 1,
    date: today,
    paid_amount: 0,
    items: [{ product_id: 1, quantity: 8, rate: 130 }],
  });
  assert.equal(sale.status, 201);
  const beforeStock = stockOf(1);
  const beforeReceivable = bal("customer", 1);
  const saleItemId = getDb().prepare(`SELECT id FROM sale_items WHERE sale_id = ? ORDER BY id LIMIT 1`).get(sale.body.id).id;
  const r = await post("/sale-returns", {
    sale_id: sale.body.id,
    date: today,
    reason: "Customer changed mind",
    items: [{ sale_item_id: saleItemId, quantity: 2 }],
  });
  assert.equal(r.status, 201);
  assert.equal(stockOf(1), beforeStock + 2);
  assert.equal(bal("customer", 1), beforeReceivable - 260);
});

test("payment received reduces customer balance and increases cash", async () => {
  await post("/sales", {
    customer_id: 1,
    date: today,
    paid_amount: 0,
    items: [{ product_id: 1, quantity: 3, rate: 130 }],
  });
  const beforeCash = bal("cash");
  const beforeBalance = bal("customer", 1);
  const r = await post("/payments", {
    direction: "in",
    party_type: "customer",
    party_id: 1,
    amount: 100,
    method: "cash",
    date: today,
    notes: "Advance payment",
  });
  assert.equal(r.status, 201);
  assert.equal(bal("cash"), beforeCash + 100);
  assert.equal(bal("customer", 1), beforeBalance - 100);
});

test("payment made reduces supplier balance and decreases cash", async () => {
  await post("/purchases", {
    supplier_id: 1,
    date: today,
    paid_amount: 0,
    items: [{ product_id: 1, batch_number: "PAY-1", expiry_date: "2030-01-01", quantity: 5, rate: 100 }],
  });
  const beforeCash = bal("cash");
  const beforeBalance = bal("supplier", 1);
  const r = await post("/payments", {
    direction: "out",
    party_type: "supplier",
    party_id: 1,
    amount: 80,
    method: "cash",
    date: today,
    notes: "Paid supplier",
  });
  assert.equal(r.status, 201);
  assert.equal(bal("cash"), beforeCash - 80);
  assert.equal(bal("supplier", 1), beforeBalance + 80);
});

test("expense reduces cash and never touches customer or supplier balances", async () => {
  const beforeCash = bal("cash");
  const beforeCustomer = bal("customer", 1);
  const beforeSupplier = bal("supplier", 1);
  const r = await post("/expenses", {
    category: "electricity",
    amount: 45,
    date: today,
    method: "cash",
    description: "Utility bill",
  });
  assert.equal(r.status, 201);
  assert.equal(bal("cash"), beforeCash - 45);
  assert.equal(bal("customer", 1), beforeCustomer);
  assert.equal(bal("supplier", 1), beforeSupplier);
});

test("returning more than the original quantity is rejected and rolls back", async () => {
  const purchase = await post("/purchases", {
    supplier_id: 1,
    date: today,
    paid_amount: 0,
    items: [{ product_id: 1, batch_number: "RET-2", expiry_date: "2030-01-01", quantity: 10, rate: 100 }],
  });
  const beforeReturns = getDb().prepare(`SELECT COUNT(*) c FROM purchase_returns`).get().c;
  const r = await post("/purchase-returns", {
    purchase_id: purchase.body.id,
    date: today,
    reason: "Too many",
    items: [{ purchase_item_id: 1, quantity: 999 }],
  });
  assert.equal(r.status, 400);
  assert.equal(getDb().prepare(`SELECT COUNT(*) c FROM purchase_returns`).get().c, beforeReturns);
});

test("dashboard totals come back", async () => {
  const r = await get("/dashboard");
  assert.equal(r.status, 200);
  assert.ok(r.body.stock_value >= 0);
  assert.ok("cash_in_hand" in r.body);
});

test("salary payment reduces cash, records history, and posts as a salary expense", async () => {
  const created = await post("/employees", { name: "Rashid", mobile: "0300", salary: 30000, role: "Salesman", joining_date: today });
  assert.equal(created.status, 201);
  const empId = created.body.id;

  const beforeCash = bal("cash");
  const beforeBank = bal("bank");
  const beforeExpense = bal("expense");

  const pay = await post(`/employees/${empId}/salary-payments`, { amount: 5000, date: today, method: "cash", notes: "Advance" });
  assert.equal(pay.status, 201);
  assert.equal(bal("cash"), beforeCash - 5000);
  assert.equal(bal("expense"), beforeExpense + 5000);

  const payBank = await post(`/employees/${empId}/salary-payments`, { amount: 2500, date: today, method: "bank" });
  assert.equal(payBank.status, 201);
  assert.equal(bal("bank"), beforeBank - 2500);
  assert.equal(bal("cash"), beforeCash - 5000);

  const history = await get(`/employees/${empId}/payments`);
  assert.equal(history.status, 200);
  assert.equal(history.body.length, 2);
  assert.equal(history.body.reduce((s, p) => s + p.amount, 0), 7500);

  const expenses = await get("/expenses");
  const salaryRows = expenses.body.filter((e) => e.category === "salary" && /Rashid/.test(e.description || ""));
  assert.equal(salaryRows.length, 2);
});

test("deactivating an employee keeps their salary payment history", async () => {
  const created = await post("/employees", { name: "Bilal", salary: 20000 });
  const empId = created.body.id;
  await post(`/employees/${empId}/salary-payments`, { amount: 1000, date: today, method: "cash" });

  const off = await post(`/employees/${empId}/deactivate`, {});
  assert.equal(off.status, 201 === off.status ? off.status : 200);
  assert.equal(off.body.is_active, 0);

  const history = await get(`/employees/${empId}/payments`);
  assert.equal(history.body.length, 1);
  assert.equal(history.body[0].amount, 1000);

  const list = await get("/employees");
  assert.ok(list.body.some((e) => e.id === empId && e.is_active === 0));
});
