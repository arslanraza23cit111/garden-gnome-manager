import { Router } from "express";
import { getDb, tx } from "../db/connection.js";
import * as ledger from "../services/ledgerService.js";
import { ValidationError, required, num, today } from "../lib/util.js";
import { logActivity } from "../lib/auth.js";

const router = Router();

const FIELDS = [
  "name",
  "father_name",
  "cnic",
  "mobile",
  "address",
  "area",
  "customer_type",
  "credit_limit",
];

router.get("/", (req, res) => {
  const q = String(req.query.search ?? "").toLowerCase();
  const rows = getDb()
    .prepare(
      `SELECT c.*, ROUND(COALESCE(l.bal, 0), 2) AS balance
         FROM customers c
         LEFT JOIN (SELECT account_ref_id, SUM(debit) - SUM(credit) AS bal
                      FROM ledger_entries WHERE account_type = 'customer'
                     GROUP BY account_ref_id) l ON l.account_ref_id = c.id
        WHERE c.is_active = 1
        ORDER BY c.name`,
    )
    .all()
    .filter((r) =>
      q ? [r.name, r.mobile, r.area, r.father_name].some((v) => String(v ?? "").toLowerCase().includes(q)) : true,
    );
  res.json(rows);
});

router.get("/:id/ledger", (req, res) => {
  const id = Number(req.params.id);
  const customer = getDb().prepare(`SELECT * FROM customers WHERE id = ?`).get(id);
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json({
    customer,
    balance: ledger.balanceOf("customer", id),
    entries: ledger.statement("customer", id, { from: req.query.from, to: req.query.to }),
  });
});

router.post("/", (req, res) => {
  const body = req.body ?? {};
  required(body.name, "Customer name");
  if (num(body.credit_limit) < 0) throw new ValidationError("Credit limit cannot be negative");
  const opening = num(body.opening_balance);

  const id = tx(() => {
    const info = getDb()
      .prepare(
        `INSERT INTO customers (${FIELDS.join(",")}, opening_balance)
         VALUES (${FIELDS.map(() => "?").join(",")}, ?)`,
      )
      .run(
        ...FIELDS.map((f) => (f === "credit_limit" ? num(body[f]) : (body[f] ?? null))),
        opening,
      );
    const newId = Number(info.lastInsertRowid);
    if (opening !== 0) {
      // Opening balance is a ledger entry, never a standalone editable number.
      ledger.post(
        [
          { account_type: "customer", account_ref_id: newId, debit: Math.max(opening, 0), credit: Math.max(-opening, 0) },
          { account_type: "capital", debit: Math.max(-opening, 0), credit: Math.max(opening, 0) },
        ],
        {
          date: body.opening_date || today(),
          source_type: "opening",
          source_id: newId,
          description: `Opening balance — ${body.name}`,
        },
      );
    }
    return newId;
  })();

  logActivity(req.user?.id, "create", "customers", id, body.name);
  res.status(201).json({ id });
});

router.put("/:id", (req, res) => {
  const body = req.body ?? {};
  required(body.name, "Customer name");
  // opening_balance is NOT updated here — it is already posted to the ledger.
  getDb()
    .prepare(`UPDATE customers SET ${FIELDS.map((f) => `${f} = ?`).join(", ")} WHERE id = ?`)
    .run(...FIELDS.map((f) => (f === "credit_limit" ? num(body[f]) : (body[f] ?? null))), req.params.id);
  logActivity(req.user?.id, "update", "customers", Number(req.params.id), body.name);
  res.json({ ok: true });
});

export default router;
