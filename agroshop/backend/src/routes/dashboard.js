import { Router } from "express";
import { getDb } from "../db/connection.js";
import * as ledger from "../services/ledgerService.js";
import { stockByProduct, totalStockValue } from "../services/stockService.js";
import { today, monthStart, round2, num } from "../lib/util.js";

const router = Router();

const one = (sql, ...p) => getDb().prepare(sql).get(...p);

/** Gross profit = sale line totals - (cost_rate * qty) for a date range. */
function profitBetween(from, to) {
  const row = one(
    `SELECT COALESCE(SUM(i.line_total - i.cost_rate * i.quantity), 0) AS profit
       FROM sale_items i JOIN sales s ON s.id = i.sale_id
      WHERE s.status = 'posted' AND s.date BETWEEN ? AND ?`,
    from,
    to,
  );
  return round2(row.profit);
}

router.get("/", (_req, res) => {
  const d = today();
  const m = monthStart();

  const todaySale = one(
    `SELECT COALESCE(SUM(total_amount),0) t, COALESCE(SUM(paid_amount),0) paid,
            COALESCE(SUM(remaining_amount),0) credit
       FROM sales WHERE status='posted' AND date = ?`,
    d,
  );
  const todayPurchase = one(
    `SELECT COALESCE(SUM(total_amount),0) t FROM purchases WHERE status='posted' AND date = ?`,
    d,
  );
  const monthSale = one(
    `SELECT COALESCE(SUM(total_amount),0) t FROM sales WHERE status='posted' AND date BETWEEN ? AND ?`,
    m,
    d,
  );
  const receipts = one(
    `SELECT COALESCE(SUM(amount),0) t FROM payments
      WHERE status='posted' AND direction='in' AND date = ?`,
    d,
  );
  const paidOut = one(
    `SELECT COALESCE(SUM(amount),0) t FROM payments
      WHERE status='posted' AND direction='out' AND date = ?`,
    d,
  );
  const todayExpense = one(
    `SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE status='posted' AND date = ?`,
    d,
  );

  const products = stockByProduct();
  const lowStock = products
    .filter((p) => p.current_stock <= p.min_stock_level)
    .map((p) => ({ id: p.id, name: p.name, company: p.company, unit: p.unit, current_stock: p.current_stock, min_stock_level: p.min_stock_level }));

  const nearExpiryLimit = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const nearExpiry = getDb()
    .prepare(
      `SELECT b.id, b.batch_number, b.expiry_date, b.quantity, p.name AS product_name, p.unit
         FROM product_batches b JOIN products p ON p.id = b.product_id
        WHERE b.quantity > 0 AND b.expiry_date IS NOT NULL AND b.expiry_date <= ?
        ORDER BY b.expiry_date ASC LIMIT 20`,
    )
    .all(nearExpiryLimit);

  const customerOutstanding = ledger.outstanding("customer").reduce((s, r) => s + r.balance, 0);
  const supplierPayable = ledger.outstanding("supplier").reduce((s, r) => s + r.balance, 0);

  res.json({
    date: d,
    today_sale: round2(todaySale.t),
    today_cash_sale: round2(todaySale.paid),
    today_credit_sale: round2(todaySale.credit),
    today_purchase: round2(todayPurchase.t),
    today_receipts: round2(receipts.t),
    today_payments: round2(paidOut.t),
    today_expense: round2(todayExpense.t),
    today_profit: profitBetween(d, d),
    month_sale: round2(monthSale.t),
    month_profit: profitBetween(m, d),
    customer_outstanding: round2(customerOutstanding),
    supplier_payable: round2(supplierPayable),
    stock_value: round2(totalStockValue()),
    cash_in_hand: ledger.balanceOf("cash"),
    bank_balance: ledger.balanceOf("bank"),
    low_stock_count: lowStock.length,
    near_expiry_count: nearExpiry.length,
    low_stock: lowStock.slice(0, 20),
    near_expiry: nearExpiry,
    recent_sales: getDb()
      .prepare(
        `SELECT s.id, s.invoice_number, s.date, s.total_amount, s.remaining_amount, c.name AS customer_name
           FROM sales s JOIN customers c ON c.id = s.customer_id
          ORDER BY s.id DESC LIMIT 8`,
      )
      .all(),
  });
});

/** General ledger / cash / bank statements (foundation for Phase 3 reports). */
router.get("/ledger/:account_type", (req, res) => {
  const { account_type } = req.params;
  const ref = req.query.ref ? num(req.query.ref) : null;
  res.json({
    account_type,
    balance: ledger.balanceOf(account_type, ref),
    entries: ledger.statement(account_type, ref, { from: req.query.from, to: req.query.to }),
  });
});

router.get("/outstanding/:party", (req, res) => {
  const type = req.params.party === "suppliers" ? "supplier" : "customer";
  res.json(ledger.outstanding(type));
});

export default router;
