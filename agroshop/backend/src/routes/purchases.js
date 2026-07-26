import { Router } from "express";
import { getDb, tx } from "../db/connection.js";
import { increaseStock } from "../services/stockService.js";
import * as ledger from "../services/ledgerService.js";
import { ValidationError, required, num, round2, today, nextInvoiceNumber } from "../lib/util.js";
import { logActivity } from "../lib/auth.js";

const router = Router();

router.get("/", (req, res) => {
  res.json(
    getDb()
      .prepare(
        `SELECT p.*, s.name AS supplier_name
           FROM purchases p JOIN suppliers s ON s.id = p.supplier_id
          ORDER BY p.date DESC, p.id DESC LIMIT ?`,
      )
      .all(num(req.query.limit, 200)),
  );
});

router.get("/next-invoice", (_req, res) =>
  res.json({ invoice_number: nextInvoiceNumber("purchases", "PUR") }),
);

router.get("/:id", (req, res) => {
  const db = getDb();
  const purchase = db
    .prepare(
      `SELECT p.*, s.name AS supplier_name, s.company AS supplier_company, s.contact AS supplier_contact
         FROM purchases p JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?`,
    )
    .get(req.params.id);
  if (!purchase) return res.status(404).json({ error: "Purchase not found" });
  const items = db
    .prepare(
      `SELECT i.*, pr.name AS product_name, pr.unit, pr.packing_size
         FROM purchase_items i JOIN products pr ON pr.id = i.product_id
        WHERE i.purchase_id = ?`,
    )
    .all(purchase.id);
  res.json({ ...purchase, items });
});

/**
 * Purchase flow (single atomic transaction):
 * purchases + purchase_items -> stock increase per batch -> ledger post.
 */
router.post("/", (req, res) => {
  const body = req.body ?? {};
  const date = body.date || today();
  required(body.supplier_id, "Supplier");
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw new ValidationError("Add at least one product line");

  const supplier = getDb().prepare(`SELECT * FROM suppliers WHERE id = ?`).get(body.supplier_id);
  if (!supplier) throw new ValidationError("Supplier not found");

  const lines = items.map((it, idx) => {
    const qty = num(it.quantity);
    const rate = num(it.rate);
    if (!(qty > 0)) throw new ValidationError(`Line ${idx + 1}: quantity must be greater than zero`);
    if (rate < 0) throw new ValidationError(`Line ${idx + 1}: rate cannot be negative`);
    if (!it.product_id) throw new ValidationError(`Line ${idx + 1}: choose a product`);
    const discount = num(it.discount);
    const tax = num(it.tax);
    return {
      product_id: Number(it.product_id),
      batch_number: String(it.batch_number || "-").trim() || "-",
      expiry_date: it.expiry_date || null,
      quantity: qty,
      rate,
      discount,
      tax,
      line_total: round2(qty * rate - discount + tax),
    };
  });

  const total = round2(lines.reduce((s, l) => s + l.line_total, 0));
  const paid = round2(num(body.paid_amount));
  if (paid < 0) throw new ValidationError("Paid amount cannot be negative");
  if (paid > total) throw new ValidationError("Paid amount cannot exceed the invoice total");
  const remaining = round2(total - paid);
  const method = body.payment_method || (paid > 0 ? "cash" : "credit");
  const invoice = String(body.invoice_number || nextInvoiceNumber("purchases", "PUR")).trim();

  const id = tx(() => {
    const db = getDb();
    const info = db
      .prepare(
        `INSERT INTO purchases (supplier_id, invoice_number, date, total_amount, discount_amount,
                                tax_amount, paid_amount, remaining_amount, payment_method, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        supplier.id,
        invoice,
        date,
        total,
        round2(lines.reduce((s, l) => s + l.discount, 0)),
        round2(lines.reduce((s, l) => s + l.tax, 0)),
        paid,
        remaining,
        method,
        body.notes ?? null,
        req.user?.id ?? null,
      );
    const purchaseId = Number(info.lastInsertRowid);

    const itemStmt = db.prepare(
      `INSERT INTO purchase_items (purchase_id, product_id, batch_number, expiry_date,
                                   quantity, rate, discount, tax, line_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const l of lines) {
      itemStmt.run(
        purchaseId,
        l.product_id,
        l.batch_number,
        l.expiry_date,
        l.quantity,
        l.rate,
        l.discount,
        l.tax,
        l.line_total,
      );
      increaseStock({
        product_id: l.product_id,
        batch_number: l.batch_number,
        expiry_date: l.expiry_date,
        quantity: l.quantity,
        rate: l.rate,
      });
      // keep the product's reference purchase price current
      db.prepare(`UPDATE products SET purchase_price = ? WHERE id = ?`).run(l.rate, l.product_id);
    }

    const entries = [
      { account_type: "purchases", debit: total },
      { account_type: "supplier", account_ref_id: supplier.id, credit: total },
    ];
    if (paid > 0) {
      entries.push({ account_type: "supplier", account_ref_id: supplier.id, debit: paid });
      entries.push({ account_type: ledger.moneyAccount(method), credit: paid });
    }
    ledger.post(entries, {
      date,
      source_type: "purchase",
      source_id: purchaseId,
      description: `Purchase ${invoice} — ${supplier.name}`,
    });
    return purchaseId;
  })();

  logActivity(req.user?.id, "create", "purchases", id, `${invoice} / ${total}`);
  res.status(201).json({ id, invoice_number: invoice, total_amount: total, remaining_amount: remaining });
});

export default router;
