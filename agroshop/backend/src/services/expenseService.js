import { getDb } from "../db/connection.js";
import * as ledger from "./ledgerService.js";
import { ValidationError, num, round2, today as todayStr } from "../lib/util.js";

export const EXPENSE_CATEGORIES = [
  "salary",
  "electricity",
  "rent",
  "transport",
  "fuel",
  "loading/unloading",
  "repair",
  "mobile/internet",
  "miscellaneous",
];

/**
 * The ONLY place an expense is written + posted to the ledger.
 * Call inside a tx() from routes. Returns the new expense id.
 */
export function recordExpense({ category, amount, date, method, description, created_by }) {
  const when = date || todayStr();
  if (!EXPENSE_CATEGORIES.includes(category)) throw new ValidationError("Unsupported category");
  const value = round2(num(amount));
  if (value <= 0) throw new ValidationError("Amount must be greater than zero");
  if (!["cash", "bank"].includes(method)) throw new ValidationError("Expenses can be paid by cash or bank");

  const info = getDb()
    .prepare(
      `INSERT INTO expenses (category, amount, date, method, description, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(category, value, when, method, description ?? null, created_by ?? null);
  const expenseId = Number(info.lastInsertRowid);

  ledger.post(
    [
      { account_type: ledger.moneyAccount(method), credit: value },
      { account_type: "expense", debit: value },
    ],
    {
      date: when,
      source_type: "expense",
      source_id: expenseId,
      description: `${category} — ${description || "Expense"}`,
    },
  );

  return { id: expenseId, amount: value, date: when };
}
