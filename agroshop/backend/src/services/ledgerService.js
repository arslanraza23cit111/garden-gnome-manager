/**
 * ledgerService — the ONLY place that writes ledger_entries.
 * All customer/supplier/cash/bank balances are DERIVED from this table.
 */
import { getDb } from "../db/connection.js";

/** Writes a balanced set of double-entry rows. Rejects unbalanced batches. */
export function post(entries, { date, source_type, source_id, description }) {
  const db = getDb();
  const rows = entries.filter((e) => (e.debit ?? 0) !== 0 || (e.credit ?? 0) !== 0);
  const debit = rows.reduce((s, e) => s + (e.debit ?? 0), 0);
  const credit = rows.reduce((s, e) => s + (e.credit ?? 0), 0);
  if (Math.abs(debit - credit) > 0.009)
    throw new Error(`Unbalanced ledger post: debit ${debit} vs credit ${credit}`);

  const stmt = db.prepare(
    `INSERT INTO ledger_entries
      (date, account_type, account_ref_id, debit, credit, source_type, source_id, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const e of rows) {
    stmt.run(
      e.date ?? date,
      e.account_type,
      e.account_ref_id ?? null,
      e.debit ?? 0,
      e.credit ?? 0,
      source_type,
      source_id ?? null,
      e.description ?? description ?? null,
    );
  }
}

const CASHLIKE = { cash: "cash", bank: "bank", cheque: "bank", online: "bank" };
/** Maps a payment method to the cash or bank account. */
export function moneyAccount(method) {
  return CASHLIKE[method] ?? "cash";
}

/** Balance for one account. Customer/supplier: positive = they owe the shop. */
export function balanceOf(account_type, account_ref_id = null) {
  const db = getDb();
  const row = account_ref_id
    ? db
        .prepare(
          `SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c
             FROM ledger_entries WHERE account_type = ? AND account_ref_id = ?`,
        )
        .get(account_type, account_ref_id)
    : db
        .prepare(
          `SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c
             FROM ledger_entries WHERE account_type = ?`,
        )
        .get(account_type);
  return +(row.d - row.c).toFixed(2);
}

/** Running-balance statement for a party / cash / bank account. */
export function statement(account_type, account_ref_id = null, { from, to } = {}) {
  const db = getDb();
  const params = [account_type];
  let sql = `SELECT * FROM ledger_entries WHERE account_type = ?`;
  if (account_ref_id) {
    sql += ` AND account_ref_id = ?`;
    params.push(account_ref_id);
  }
  if (from) {
    sql += ` AND date >= ?`;
    params.push(from);
  }
  if (to) {
    sql += ` AND date <= ?`;
    params.push(to);
  }
  sql += ` ORDER BY date ASC, id ASC`;
  let running = 0;
  return db.prepare(sql).all(...params).map((r) => {
    running = +(running + r.debit - r.credit).toFixed(2);
    return { ...r, balance: running };
  });
}

/** Outstanding list for all customers (owed to shop) or suppliers (owed by shop). */
export function outstanding(account_type) {
  const table = account_type === "customer" ? "customers" : "suppliers";
  const sign = account_type === "customer" ? 1 : -1;
  return getDb()
    .prepare(
      `SELECT t.id, t.name, t.mobile_or_contact AS contact, ROUND(l.bal, 2) * ${sign} AS balance
         FROM (SELECT id, name,
                      ${table === "customers" ? "mobile" : "contact"} AS mobile_or_contact
                 FROM ${table}) t
         JOIN (SELECT account_ref_id, SUM(debit) - SUM(credit) AS bal
                 FROM ledger_entries WHERE account_type = ?
                GROUP BY account_ref_id) l ON l.account_ref_id = t.id
        WHERE ROUND(l.bal, 2) <> 0
        ORDER BY ABS(l.bal) DESC`,
    )
    .all(account_type);
}
