import { Router } from "express";
import { getDb, tx } from "../db/connection.js";
import { decreaseStockFEFO } from "../services/stockService.js";
import * as ledger from "../services/ledgerService.js";
import { ValidationError, required, num, round2, today, nextInvoiceNumber } from "../lib/util.js";
import { logActivity } from "../lib/auth.js";

const router = Router();

function resolveSaleUnit(db, item, idx) {
  const hasMultiUnitInput = item.product_unit_id !== undefined || item.quantity_in_unit !== undefined;
  const product = db.prepare(`SELECT * FROM products WHERE id = ?`).get(item.product_id);
  if (!product) throw new ValidationError(`Line ${idx + 1}: product not found`);

  if (!hasMultiUnitInput) {
    const qty = num(item.quantity);
    const unit =
      db
        .prepare(
          `SELECT * FROM product_units
            WHERE product_id = ? AND is_active = 1
            ORDER BY is_default DESC, id ASC LIMIT 1`,
        )
        .get(product.id) ?? null;
    return {
      quantity: qty,
      unit_label: unit?.unit_label ?? product.unit,
      conversion_factor: unit?.conversion_factor ?? 1,
      quantity_in_unit: qty,
      quantity_base: qty,
    };
  }

  required(item.product_unit_id, `Line ${idx + 1}: unit`);
  const quantityInUnit = num(item.quantity_in_unit);
  const unit = db
    .prepare(`SELECT * FROM product_units WHERE id = ? AND product_id = ? AND is_active = 1`)
    .get(item.product_unit_id, product.id);
  if (!unit) throw new ValidationError(`Line ${idx + 1}: active product unit not found`);
  const quantityBase = Math.round(quantityInUnit * unit.conversion_factor);
  return {
    quantity: quantityBase,
    unit_label: unit.unit_label,
    conversion_factor: unit.conversion_factor,
    quantity_in_unit: quantityInUnit,
    quantity_base: quantityBase,
  };
}

router.get("/", (req, res) => {
  res.json(
    getDb()
      .prepare(
        `SELECT s.*, c.name AS customer_name
           FROM sales s JOIN customers c ON c.id = s.customer_id
          ORDER BY s.date DESC, s.id DESC LIMIT ?`,
      )
      .all(num(req.query.limit, 200)),
  );
});

router.get("/next-invoice", (_req, res) => res.json({ invoice_number: nextInvoiceNumber("sales", "SAL") }));

router.get("/:id", (req, res) => {
  const db = getDb();
  const sale = db
    .prepare(
      `SELECT s.*, c.name AS customer_name, c.mobile AS customer_mobile,
              c.address AS customer_address, c.area AS customer_area
         FROM sales s JOIN customers c ON c.id = s.customer_id WHERE s.id = ?`,
    )
    .get(req.params.id);
  if (!sale) return res.status(404).json({ error: "Sale not found" });
  const items = db
    .prepare(
      `SELECT i.*, p.name AS product_name, p.unit, p.packing_size, p.company
         FROM sale_items i JOIN products p ON p.id = i.product_id
        WHERE i.sale_id = ?`,
    )
    .all(sale.id);
  const settings = Object.fromEntries(db.prepare(`SELECT key, value FROM settings`).all().map((r) => [r.key, r.value]));
  res.json({ ...sale, items, shop: settings });
});

/**
 * Sale flow (single atomic transaction):
 * validate stock -> sales + sale_items (one row per batch consumed, FEFO)
 * -> stock decrease -> ledger post (customer debit, sales credit, cash debit for paid part).
 */
router.post("/", (req, res) => {
  const body = req.body ?? {};
  const date = body.date || today();
  required(body.customer_id, "Customer");
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw new ValidationError("Add at least one product line");

  const db = getDb();
  const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(body.customer_id);
  if (!customer) throw new ValidationError("Customer not found");

  const lines = items.map((it, idx) => {
    if (!it.product_id) throw new ValidationError(`Line ${idx + 1}: choose a product`);
    const unitSnapshot = resolveSaleUnit(db, it, idx);
    const qty = unitSnapshot.quantity_in_unit;
    const rate = num(it.rate);
    if (!(qty > 0)) throw new ValidationError(`Line ${idx + 1}: quantity must be greater than zero`);
    if (!(unitSnapshot.quantity_base > 0)) throw new ValidationError(`Line ${idx + 1}: base quantity must be greater than zero`);
    if (rate < 0) throw new ValidationError(`Line ${idx + 1}: rate cannot be negative`);
    const discount = num(it.discount);
    return {
      product_id: Number(it.product_id),
      quantity: unitSnapshot.quantity_base,
      unit_label: unitSnapshot.unit_label,
      conversion_factor: unitSnapshot.conversion_factor,
      quantity_in_unit: unitSnapshot.quantity_in_unit,
      quantity_base: unitSnapshot.quantity_base,
      rate,
      discount,
      line_total: round2(qty * rate - discount),
    };
  });

  // Pre-flight stock check so nothing is written when stock is short.
  const wanted = new Map();
  for (const l of lines) wanted.set(l.product_id, (wanted.get(l.product_id) ?? 0) + l.quantity_base);
  for (const [product_id, qty] of wanted) {
    const row = db
      .prepare(`SELECT COALESCE(SUM(quantity),0) AS q FROM product_batches WHERE product_id = ?`)
      .get(product_id);
    if (row.q < qty) {
      const p = db.prepare(`SELECT name FROM products WHERE id = ?`).get(product_id);
      throw new ValidationError(
        `Not enough stock for ${p?.name ?? "product"} — available ${row.q}, requested ${qty}`,
      );
    }
  }

  const total = round2(lines.reduce((s, l) => s + l.line_total, 0));
  const paid = round2(num(body.paid_amount));
  if (paid < 0) throw new ValidationError("Paid amount cannot be negative");
  if (paid > total) throw new ValidationError("Paid amount cannot exceed the invoice total");
  const remaining = round2(total - paid);
  const method = body.payment_method || (paid > 0 ? "cash" : "credit");

  if (remaining > 0 && customer.credit_limit > 0) {
    const exposure = round2(ledger.balanceOf("customer", customer.id) + remaining);
    if (exposure > customer.credit_limit)
      throw new ValidationError(
        `Credit limit exceeded for ${customer.name}: limit ${customer.credit_limit}, would become ${exposure}`,
      );
  }

  const invoice = String(body.invoice_number || nextInvoiceNumber("sales", "SAL")).trim();

  const id = tx(() => {
    const info = db
      .prepare(
        `INSERT INTO sales (customer_id, invoice_number, date, total_amount, discount_amount,
                            paid_amount, remaining_amount, payment_method, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        customer.id,
        invoice,
        date,
        total,
        round2(lines.reduce((s, l) => s + l.discount, 0)),
        paid,
        remaining,
        method,
        body.notes ?? null,
        req.user?.id ?? null,
      );
    const saleId = Number(info.lastInsertRowid);

    const itemStmt = db.prepare(
      `INSERT INTO sale_items (sale_id, product_id, batch_id, batch_number, quantity,
                               unit_label, conversion_factor, quantity_in_unit, quantity_base,
                               rate, discount, cost_rate, line_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const l of lines) {
      // FEFO allocation may split one line across batches -> one row per batch.
      const allocation = decreaseStockFEFO({ product_id: l.product_id, quantity: l.quantity_base });
      for (const a of allocation) {
        const share = a.quantity / l.quantity_base;
        itemStmt.run(
          saleId,
          l.product_id,
          a.batch_id,
          a.batch_number,
          a.quantity,
          l.unit_label,
          l.conversion_factor,
          l.quantity_in_unit * share,
          a.quantity,
          l.rate,
          round2(l.discount * share),
          a.cost_rate,
          round2(l.line_total * share),
        );
      }
    }

    const entries = [
      { account_type: "customer", account_ref_id: customer.id, debit: total },
      { account_type: "sales", credit: total },
    ];
    if (paid > 0) {
      entries.push({ account_type: ledger.moneyAccount(method), debit: paid });
      entries.push({ account_type: "customer", account_ref_id: customer.id, credit: paid });
    }
    ledger.post(entries, {
      date,
      source_type: "sale",
      source_id: saleId,
      description: `Sale ${invoice} — ${customer.name}`,
    });
    return saleId;
  })();

  logActivity(req.user?.id, "create", "sales", id, `${invoice} / ${total}`);
  res.status(201).json({ id, invoice_number: invoice, total_amount: total, remaining_amount: remaining });
});

export default router;
