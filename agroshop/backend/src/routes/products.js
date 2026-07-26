import { Router } from "express";
import { getDb } from "../db/connection.js";
import { stockByProduct, batchesForProduct } from "../services/stockService.js";
import { ValidationError, required, num } from "../lib/util.js";
import { logActivity } from "../lib/auth.js";

const router = Router();

const FIELDS = [
  "name",
  "company",
  "category",
  "type",
  "unit",
  "packing_size",
  "purchase_price",
  "sale_price",
  "retail_price",
  "wholesale_price",
  "min_stock_level",
];

function validate(body) {
  required(body.name, "Product name");
  required(body.unit, "Unit");
  for (const f of ["purchase_price", "sale_price", "retail_price", "wholesale_price", "min_stock_level"]) {
    if (num(body[f]) < 0) throw new ValidationError(`${f.replace(/_/g, " ")} cannot be negative`);
  }
}

router.get("/", (req, res) => {
  const q = String(req.query.search ?? "").toLowerCase();
  let rows = stockByProduct();
  if (q)
    rows = rows.filter((r) =>
      [r.name, r.company, r.category, r.type].some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
  res.json(rows);
});

router.get("/low-stock", (_req, res) => {
  res.json(stockByProduct().filter((p) => p.current_stock <= p.min_stock_level));
});

router.get("/expiring", (req, res) => {
  const days = num(req.query.days, 90);
  const limit = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  res.json(
    getDb()
      .prepare(
        `SELECT b.*, p.name AS product_name, p.company, p.unit
           FROM product_batches b JOIN products p ON p.id = b.product_id
          WHERE b.quantity > 0 AND b.expiry_date IS NOT NULL AND b.expiry_date <= ?
          ORDER BY b.expiry_date ASC`,
      )
      .all(limit),
  );
});

router.get("/:id", (req, res) => {
  const product = stockByProduct().find((p) => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json({ ...product, batches: batchesForProduct(product.id) });
});

router.post("/", (req, res) => {
  const body = req.body ?? {};
  validate(body);
  const info = getDb()
    .prepare(
      `INSERT INTO products (${FIELDS.join(",")}) VALUES (${FIELDS.map(() => "?").join(",")})`,
    )
    .run(
      ...FIELDS.map((f) =>
        f.includes("price") || f === "min_stock_level" ? num(body[f]) : (body[f] ?? null),
      ),
    );
  logActivity(req.user?.id, "create", "products", info.lastInsertRowid, body.name);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put("/:id", (req, res) => {
  const body = req.body ?? {};
  validate(body);
  // NOTE: current_stock is deliberately NOT editable here — stock only moves
  // through purchases / sales / returns.
  getDb()
    .prepare(`UPDATE products SET ${FIELDS.map((f) => `${f} = ?`).join(", ")} WHERE id = ?`)
    .run(
      ...FIELDS.map((f) =>
        f.includes("price") || f === "min_stock_level" ? num(body[f]) : (body[f] ?? null),
      ),
      req.params.id,
    );
  logActivity(req.user?.id, "update", "products", Number(req.params.id), body.name);
  res.json({ ok: true });
});

export default router;
