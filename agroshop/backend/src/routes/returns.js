import { Router } from "express";
import { getDb, tx } from "../db/connection.js";
import { decreaseStockFromBatch, restoreStock } from "../services/stockService.js";
import * as ledger from "../services/ledgerService.js";
import { ValidationError, required, num, round2, today } from "../lib/util.js";
import { logActivity } from "../lib/auth.js";

const router = Router();

function invoiceNumberForPurchase(purchase) {
  return purchase?.invoice_number || "PUR-0000";
}

function invoiceNumberForSale(sale) {
  return sale?.invoice_number || "SAL-0000";
}

function effectiveConversionFactor(item) {
  const quantityInUnit = Number(item.quantity_in_unit || item.quantity);
  const quantityBase = Number(item.quantity_base || item.quantity);
  if (quantityInUnit > 0 && quantityBase > 0) return quantityBase / quantityInUnit;
  return Number(item.conversion_factor || 1);
}

router.get("/purchase-returns", (_req, res) => {
  res.json(
    getDb()
      .prepare(
        `SELECT pr.*, p.invoice_number, s.name AS supplier_name
           FROM purchase_returns pr
           JOIN purchases p ON p.id = pr.purchase_id
           JOIN suppliers s ON s.id = pr.supplier_id
          ORDER BY pr.id DESC`,
      )
      .all(),
  );
});

router.get("/sale-returns", (_req, res) => {
  res.json(
    getDb()
      .prepare(
        `SELECT sr.*, s.invoice_number, c.name AS customer_name
           FROM sale_returns sr
           JOIN sales s ON s.id = sr.sale_id
           JOIN customers c ON c.id = sr.customer_id
          ORDER BY sr.id DESC`,
      )
      .all(),
  );
});

router.post("/purchase-returns", (req, res) => {
  const body = req.body ?? {};
  const date = body.date || today();
  required(body.purchase_id, "Purchase");

  const db = getDb();
  const purchase = db
    .prepare(
      `SELECT p.*, s.name AS supplier_name
         FROM purchases p JOIN suppliers s ON s.id = p.supplier_id
        WHERE p.id = ?`,
    )
    .get(body.purchase_id);
  if (!purchase) throw new ValidationError("Purchase not found");

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw new ValidationError("Add at least one return line");

  const purchaseItems = new Map(
    db
      .prepare(`SELECT * FROM purchase_items WHERE purchase_id = ?`)
      .all(purchase.id)
      .map((row) => [row.id, row]),
  );
  const purchaseItemIds = [...new Set(items.map((entry) => Number(entry.purchase_item_id)).filter(Number.isFinite))];
  const alreadyReturnedByPurchaseItem = new Map(
    purchaseItemIds.length
      ? db
          .prepare(
            `SELECT purchase_item_id, COALESCE(SUM(quantity_base), 0) AS returned_base
               FROM purchase_return_items
              WHERE purchase_item_id IN (${purchaseItemIds.map(() => "?").join(", ")})
              GROUP BY purchase_item_id`,
          )
          .all(...purchaseItemIds)
          .map((row) => [Number(row.purchase_item_id), Number(row.returned_base || 0)])
      : [],
  );

  const lines = items.map((entry, idx) => {
    const purchaseItem = purchaseItems.get(Number(entry.purchase_item_id));
    if (!purchaseItem) throw new ValidationError(`Line ${idx + 1}: purchase item not found`);
    const qty = num(entry.quantity);
    const conversionFactor = effectiveConversionFactor(purchaseItem);
    const originalBase = Number(purchaseItem.quantity_base || purchaseItem.quantity);
    const alreadyReturned = alreadyReturnedByPurchaseItem.get(purchaseItem.id) || 0;
    const remainingBase = Math.max(0, originalBase - alreadyReturned);
    const qtyBase = Math.round(qty * conversionFactor);
    if (!(qty > 0)) throw new ValidationError(`Line ${idx + 1}: quantity must be greater than zero`);
    if (qtyBase > remainingBase)
      throw new ValidationError(
        `Line ${idx + 1}: cannot return ${qtyBase} of ${remainingBase} remaining purchased`,
      );
    return {
      purchase_item_id: purchaseItem.id,
      product_id: purchaseItem.product_id,
      batch_number: String(purchaseItem.batch_number || "-").trim() || "-",
      expiry_date: purchaseItem.expiry_date || null,
      quantity: qtyBase,
      unit_label: purchaseItem.unit_label,
      conversion_factor: conversionFactor,
      quantity_in_unit: qty,
      quantity_base: qtyBase,
      rate: purchaseItem.rate,
      line_total: round2(qty * purchaseItem.rate),
    };
  });

  const total = round2(lines.reduce((s, l) => s + l.line_total, 0));
  const id = tx(() => {
    const info = db
      .prepare(
        `INSERT INTO purchase_returns (purchase_id, supplier_id, date, reason, total_amount, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(purchase.id, purchase.supplier_id, date, body.reason ?? null, total, req.user?.id ?? null);
    const returnId = Number(info.lastInsertRowid);

    const stmt = db.prepare(
      `INSERT INTO purchase_return_items (purchase_return_id, purchase_item_id, product_id, batch_number, quantity, quantity_base, rate, line_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const line of lines) {
      stmt.run(
        returnId,
        line.purchase_item_id,
        line.product_id,
        line.batch_number,
        line.quantity,
        line.quantity_base,
        line.rate,
        line.line_total,
      );
      decreaseStockFromBatch({
        product_id: line.product_id,
        batch_number: line.batch_number,
        expiry_date: line.expiry_date,
        quantity: line.quantity_base,
      });
    }

    ledger.post(
      [
        { account_type: "supplier", account_ref_id: purchase.supplier_id, debit: total },
        { account_type: "purchase_return", credit: total },
      ],
      {
        date,
        source_type: "purchase_return",
        source_id: returnId,
        description: `Purchase return ${invoiceNumberForPurchase(purchase)} — ${purchase.supplier_name}`,
      },
    );
    return returnId;
  })();

  logActivity(req.user?.id, "create", "purchase_returns", id, `${invoiceNumberForPurchase(purchase)} / ${total}`);
  res.status(201).json({ id, total_amount: total });
});

router.post("/sale-returns", (req, res) => {
  const body = req.body ?? {};
  const date = body.date || today();
  required(body.sale_id, "Sale");

  const db = getDb();
  const sale = db
    .prepare(
      `SELECT s.*, c.name AS customer_name
         FROM sales s JOIN customers c ON c.id = s.customer_id
        WHERE s.id = ?`,
    )
    .get(body.sale_id);
  if (!sale) throw new ValidationError("Sale not found");

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw new ValidationError("Add at least one return line");

  const saleItems = new Map(
    db
      .prepare(`SELECT * FROM sale_items WHERE sale_id = ?`)
      .all(sale.id)
      .map((row) => [row.id, row]),
  );
  const saleItemIds = [...new Set(items.map((entry) => Number(entry.sale_item_id)).filter(Number.isFinite))];
  const alreadyReturnedBySaleItem = new Map(
    saleItemIds.length
      ? db
          .prepare(
            `SELECT sale_item_id, COALESCE(SUM(quantity_base), 0) AS returned_base
               FROM sale_return_items
              WHERE sale_item_id IN (${saleItemIds.map(() => "?").join(", ")})
              GROUP BY sale_item_id`,
          )
          .all(...saleItemIds)
          .map((row) => [Number(row.sale_item_id), Number(row.returned_base || 0)])
      : [],
  );

  const lines = items.map((entry, idx) => {
    const saleItem = saleItems.get(Number(entry.sale_item_id));
    if (!saleItem) throw new ValidationError(`Line ${idx + 1}: sale item not found`);
    const qty = num(entry.quantity);
    const conversionFactor = effectiveConversionFactor(saleItem);
    const originalBase = Number(saleItem.quantity_base || saleItem.quantity);
    const alreadyReturned = alreadyReturnedBySaleItem.get(saleItem.id) || 0;
    const remainingBase = Math.max(0, originalBase - alreadyReturned);
    const qtyBase = Math.round(qty * conversionFactor);
    if (!(qty > 0)) throw new ValidationError(`Line ${idx + 1}: quantity must be greater than zero`);
    if (qtyBase > remainingBase)
      throw new ValidationError(`Line ${idx + 1}: cannot return ${qtyBase} of ${remainingBase} remaining sold`);

    const batch = saleItem.batch_id
      ? db.prepare(`SELECT * FROM product_batches WHERE id = ?`).get(saleItem.batch_id)
      : null;
    return {
      sale_item_id: saleItem.id,
      product_id: saleItem.product_id,
      batch_number: String(saleItem.batch_number || batch?.batch_number || "-").trim() || "-",
      expiry_date: batch?.expiry_date || null,
      quantity: qtyBase,
      unit_label: saleItem.unit_label,
      conversion_factor: conversionFactor,
      quantity_in_unit: qty,
      quantity_base: qtyBase,
      rate: saleItem.rate,
      line_total: round2(qty * saleItem.rate),
    };
  });

  const total = round2(lines.reduce((s, l) => s + l.line_total, 0));
  const id = tx(() => {
    const info = db
      .prepare(
        `INSERT INTO sale_returns (sale_id, customer_id, date, reason, total_amount, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(sale.id, sale.customer_id, date, body.reason ?? null, total, req.user?.id ?? null);
    const returnId = Number(info.lastInsertRowid);

    const stmt = db.prepare(
      `INSERT INTO sale_return_items (sale_return_id, sale_item_id, product_id, batch_number, expiry_date, quantity, quantity_base, rate, line_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const line of lines) {
      stmt.run(
        returnId,
        line.sale_item_id,
        line.product_id,
        line.batch_number,
        line.expiry_date,
        line.quantity,
        line.quantity_base,
        line.rate,
        line.line_total,
      );
      restoreStock({
        product_id: line.product_id,
        batch_number: line.batch_number,
        expiry_date: line.expiry_date,
        quantity: line.quantity_base,
        rate: line.rate,
      });
    }

    ledger.post(
      [
        { account_type: "customer", account_ref_id: sale.customer_id, credit: total },
        { account_type: "sales_return", debit: total },
      ],
      {
        date,
        source_type: "sale_return",
        source_id: returnId,
        description: `Sale return ${invoiceNumberForSale(sale)} — ${sale.customer_name}`,
      },
    );
    return returnId;
  })();

  logActivity(req.user?.id, "create", "sale_returns", id, `${invoiceNumberForSale(sale)} / ${total}`);
  res.status(201).json({ id, total_amount: total });
});

export default router;
