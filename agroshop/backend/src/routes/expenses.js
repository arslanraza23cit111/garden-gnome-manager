import { Router } from "express";
import { getDb, tx } from "../db/connection.js";
import * as ledger from "../services/ledgerService.js";
import { ValidationError, required, num, round2, today } from "../lib/util.js";
import { logActivity } from "../lib/auth.js";

const router = Router();
const ALLOWED = ["salary", "electricity", "rent", "transport", "fuel", "loading/unloading", "repair", "mobile/internet", "miscellaneous"];

router.get("/", (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM expenses WHERE status='posted' ORDER BY date DESC, id DESC`).all();
  if (req.query.category) {
    return res.json(rows.filter((r) => r.category === req.query.category));
  }
  if (req.query.from || req.query.to) {
    return res.json(rows.filter((r) => (req.query.from ? r.date >= req.query.from : true) && (req.query.to ? r.date <= req.query.to : true)));
  }
  res.json(rows);
});

router.post("/", (req, res) => {
  const body = req.body ?? {};
  const date = body.date || today();
  required(body.category, "Category");
  if (!ALLOWED.includes(body.category)) throw new ValidationError("Unsupported category");
  const amount = round2(num(body.amount));
  if (amount <= 0) throw new ValidationError("Amount must be greater than zero");
  if (!["cash", "bank"].includes(body.method)) throw new ValidationError("Expenses can be paid by cash or bank");

  const id = tx(() => {
    const info = getDb()
      .prepare(
        `INSERT INTO expenses (category, amount, date, method, description, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(body.category, amount, date, body.method, body.description ?? null, req.user?.id ?? null);
    const expenseId = Number(info.lastInsertRowid);
    ledger.post(
      [
        { account_type: ledger.moneyAccount(body.method), credit: amount },
        { account_type: "expense", debit: amount },
      ],
      {
        date,
        source_type: "expense",
        source_id: expenseId,
        description: `${body.category} — ${body.description || "Expense"}`,
      },
    );
    return expenseId;
  })();

  logActivity(req.user?.id, "create", "expenses", id, `${body.category} / ${amount}`);
  res.status(201).json({ id, amount, category: body.category });
});

export default router;
