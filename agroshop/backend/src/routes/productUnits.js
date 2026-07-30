import { Router } from "express";
import { getDb, tx } from "../db/connection.js";
import { ValidationError, required, num } from "../lib/util.js";

const router = Router({ mergeParams: true });

function productId(req) {
  return Number(req.params.productId);
}

function ensureProduct(id) {
  const product = getDb().prepare(`SELECT id FROM products WHERE id = ?`).get(id);
  if (!product) throw new ValidationError("Product not found");
}

function usedInTransactions(unit) {
  const db = getDb();
  const purchaseUse = db
    .prepare(
      `SELECT COUNT(*) AS c FROM purchase_items
        WHERE product_id = ? AND unit_label = ? AND conversion_factor = ?`,
    )
    .get(unit.product_id, unit.unit_label, unit.conversion_factor).c;
  const saleUse = db
    .prepare(
      `SELECT COUNT(*) AS c FROM sale_items
        WHERE product_id = ? AND unit_label = ? AND conversion_factor = ?`,
    )
    .get(unit.product_id, unit.unit_label, unit.conversion_factor).c;
  return purchaseUse + saleUse > 0;
}

router.get("/", (req, res) => {
  const id = productId(req);
  ensureProduct(id);
  const includeInactive = req.query.include_inactive === "1";
  res.json(
    getDb()
      .prepare(
        `SELECT * FROM product_units
          WHERE product_id = ? ${includeInactive ? "" : "AND is_active = 1"}
          ORDER BY is_default DESC, id ASC`,
      )
      .all(id),
  );
});

router.post("/", (req, res) => {
  const id = productId(req);
  ensureProduct(id);
  const body = req.body ?? {};
  required(body.unit_label, "Unit label");
  const conversionFactor = num(body.conversion_factor);
  const salePrice = num(body.sale_price);
  if (!Number.isInteger(conversionFactor) || conversionFactor < 1)
    throw new ValidationError("Conversion factor must be an integer greater than or equal to 1");
  if (salePrice < 0) throw new ValidationError("Sale price cannot be negative");

  const unitId = tx(() => {
    const db = getDb();
    const hasDefault = db
      .prepare(`SELECT id FROM product_units WHERE product_id = ? AND is_default = 1 LIMIT 1`)
      .get(id);
    const isDefault = body.is_default ? 1 : hasDefault ? 0 : 1;
    if (isDefault) db.prepare(`UPDATE product_units SET is_default = 0 WHERE product_id = ?`).run(id);
    const info = db
      .prepare(
        `INSERT INTO product_units (product_id, unit_label, conversion_factor, sale_price, is_active, is_default)
         VALUES (?, ?, ?, ?, 1, ?)`,
      )
      .run(id, String(body.unit_label).trim(), conversionFactor, salePrice, isDefault);
    return Number(info.lastInsertRowid);
  })();

  res.status(201).json({ id: unitId });
});

router.patch("/:unitId/deactivate", (req, res) => {
  const id = productId(req);
  ensureProduct(id);
  const db = getDb();
  const unit = db.prepare(`SELECT * FROM product_units WHERE id = ? AND product_id = ?`).get(req.params.unitId, id);
  if (!unit) throw new ValidationError("Product unit not found");
  db.prepare(`UPDATE product_units SET is_active = 0, is_default = 0 WHERE id = ?`).run(unit.id);
  res.json({ ok: true, deactivated: true });
});

router.delete("/:unitId", (req, res) => {
  const id = productId(req);
  ensureProduct(id);
  const db = getDb();
  const unit = db.prepare(`SELECT * FROM product_units WHERE id = ? AND product_id = ?`).get(req.params.unitId, id);
  if (!unit) throw new ValidationError("Product unit not found");
  if (usedInTransactions(unit)) {
    db.prepare(`UPDATE product_units SET is_active = 0, is_default = 0 WHERE id = ?`).run(unit.id);
    return res.json({ ok: true, deactivated: true });
  }
  db.prepare(`DELETE FROM product_units WHERE id = ?`).run(unit.id);
  res.json({ ok: true, deleted: true });
});

export default router;
