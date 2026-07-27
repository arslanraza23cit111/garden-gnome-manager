import { Router } from "express";
import { getDb, tx } from "../db/connection.js";
import { recordExpense, EXPENSE_CATEGORIES } from "../services/expenseService.js";
import { ValidationError, required, today } from "../lib/util.js";
import { logActivity } from "../lib/auth.js";

const router = Router();
const ALLOWED = EXPENSE_CATEGORIES;

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

  const result = tx(() =>
    recordExpense({
      category: body.category,
      amount: body.amount,
      date,
      method: body.method,
      description: body.description,
      created_by: req.user?.id ?? null,
    }),
  )();

  logActivity(req.user?.id, "create", "expenses", result.id, `${body.category} / ${result.amount}`);
  res.status(201).json({ id: result.id, amount: result.amount, category: body.category });
});

export default router;
