import { Router } from "express";
import { getDb, tx } from "../db/connection.js";
import * as ledger from "../services/ledgerService.js";
import { required, num, today } from "../lib/util.js";
import { logActivity } from "../lib/auth.js";

const router = Router();

const FIELDS = ["name", "company", "contact", "address"];

router.get("/", (req, res) => {
  const q = String(req.query.search ?? "").toLowerCase();
  const rows = getDb()
    .prepare(
      `SELECT s.*, ROUND(COALESCE(-l.bal, 0), 2) AS payable
         FROM suppliers s
         LEFT JOIN (SELECT account_ref_id, SUM(debit) - SUM(credit) AS bal
                      FROM ledger_entries WHERE account_type = 'supplier'
                     GROUP BY account_ref_id) l ON l.account_ref_id = s.id
        WHERE s.is_active = 1
        ORDER BY s.name`,
    )
    .all()
    .filter((r) =>
      q ? [r.name, r.company, r.contact].some((v) => String(v ?? "").toLowerCase().includes(q)) : true,
    );
  res.json(rows);
});

router.get("/:id/ledger", (req, res) => {
  const id = Number(req.params.id);
  const supplier = getDb().prepare(`SELECT * FROM suppliers WHERE id = ?`).get(id);
  if (!supplier) return res.status(404).json({ error: "Supplier not found" });
  res.json({
    supplier,
    payable: -ledger.balanceOf("supplier", id),
    entries: ledger.statement("supplier", id, { from: req.query.from, to: req.query.to }),
  });
});

router.post("/", (req, res) => {
  const body = req.body ?? {};
  required(body.name, "Supplier name");
  const opening = num(body.opening_balance); // positive = we owe the supplier

  const id = tx(() => {
    const info = getDb()
      .prepare(
        `INSERT INTO suppliers (${FIELDS.join(",")}, opening_balance)
         VALUES (${FIELDS.map(() => "?").join(",")}, ?)`,
      )
      .run(...FIELDS.map((f) => body[f] ?? null), opening);
    const newId = Number(info.lastInsertRowid);
    if (opening !== 0) {
      ledger.post(
        [
          { account_type: "supplier", account_ref_id: newId, credit: Math.max(opening, 0), debit: Math.max(-opening, 0) },
          { account_type: "capital", debit: Math.max(opening, 0), credit: Math.max(-opening, 0) },
        ],
        {
          date: body.opening_date || today(),
          source_type: "opening",
          source_id: newId,
          description: `Opening payable — ${body.name}`,
        },
      );
    }
    return newId;
  })();

  logActivity(req.user?.id, "create", "suppliers", id, body.name);
  res.status(201).json({ id });
});

router.put("/:id", (req, res) => {
  const body = req.body ?? {};
  required(body.name, "Supplier name");
  getDb()
    .prepare(`UPDATE suppliers SET ${FIELDS.map((f) => `${f} = ?`).join(", ")} WHERE id = ?`)
    .run(...FIELDS.map((f) => body[f] ?? null), req.params.id);
  logActivity(req.user?.id, "update", "suppliers", Number(req.params.id), body.name);
  res.json({ ok: true });
});

export default router;
