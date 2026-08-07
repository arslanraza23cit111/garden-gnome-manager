import { Router } from "express";
import { getDb } from "../db/connection.js";
import * as ledger from "../services/ledgerService.js";
import { stockByProduct, totalStockValue } from "../services/stockService.js";
import { today, monthStart, round2, num } from "../lib/util.js";
import { SHOP_NAME, SHOP_ADDRESS, SHOP_PHONE, SHOP_EMAIL } from "../lib/shopIdentity.js";

const router = Router();

const one = (sql, ...p) => getDb().prepare(sql).get(...p);

function accountName(row) {
  if (row.account_type === "customer") return row.account_name || `Customer #${row.account_ref_id}`;
  if (row.account_type === "supplier") return row.account_name || `Supplier #${row.account_ref_id}`;
  return row.account_type.replace("_", " ");
}

function balanceAsOf(accountType, accountRefId, asOf) {
  const params = [accountType];
  let sql = `SELECT COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c
               FROM ledger_entries
              WHERE account_type = ?`;
  if (accountRefId) {
    sql += ` AND account_ref_id = ?`;
    params.push(accountRefId);
  }
  if (asOf) {
    sql += ` AND date <= ?`;
    params.push(asOf);
  }
  const row = one(sql, ...params);
  return round2(row.d - row.c);
}

function trialBalance(asOf) {
  const rows = getDb()
    .prepare(
      `SELECT l.account_type, l.account_ref_id,
              CASE
                WHEN l.account_type = 'customer' THEN c.name
                WHEN l.account_type = 'supplier' THEN s.name
                ELSE NULL
              END AS account_name,
              ROUND(SUM(l.debit), 2) AS debit,
              ROUND(SUM(l.credit), 2) AS credit,
              ROUND(SUM(l.debit) - SUM(l.credit), 2) AS balance
         FROM ledger_entries l
         LEFT JOIN customers c ON c.id = l.account_ref_id AND l.account_type = 'customer'
         LEFT JOIN suppliers s ON s.id = l.account_ref_id AND l.account_type = 'supplier'
        WHERE l.date <= ?
        GROUP BY l.account_type, l.account_ref_id
        ORDER BY l.account_type, account_name, l.account_ref_id`,
    )
    .all(asOf)
    .map((row) => ({ ...row, account_name: accountName(row) }));

  const totals = rows.reduce(
    (acc, row) => ({
      debit: round2(acc.debit + row.debit),
      credit: round2(acc.credit + row.credit),
      balance: round2(acc.balance + row.balance),
    }),
    { debit: 0, credit: 0, balance: 0 },
  );

  return { as_of: asOf, rows, totals };
}

function profitLossBetween(from, to) {
  const sales = one(
    `SELECT COALESCE(SUM(total_amount),0) AS revenue
       FROM sales
      WHERE status = 'posted' AND date BETWEEN ? AND ?`,
    from,
    to,
  );
  const cogs = one(
    `SELECT COALESCE(SUM(i.cost_rate * i.quantity), 0) AS cogs
       FROM sale_items i JOIN sales s ON s.id = i.sale_id
      WHERE s.status = 'posted' AND s.date BETWEEN ? AND ?`,
    from,
    to,
  );
  const expenses = one(
    `SELECT COALESCE(SUM(amount), 0) AS expenses
       FROM expenses
      WHERE status = 'posted' AND date BETWEEN ? AND ?`,
    from,
    to,
  );
  const revenue = round2(sales.revenue);
  const costOfGoodsSold = round2(cogs.cogs);
  const expenseTotal = round2(expenses.expenses);
  const grossProfit = round2(revenue - costOfGoodsSold);
  const netProfit = round2(grossProfit - expenseTotal);
  return {
    from,
    to,
    revenue,
    cost_of_goods_sold: costOfGoodsSold,
    gross_profit: grossProfit,
    expenses: expenseTotal,
    net_profit: netProfit,
  };
}

function balanceSheet(asOf) {
  const cash = balanceAsOf("cash", null, asOf);
  const bank = balanceAsOf("bank", null, asOf);
  const customerReceivables = getDb()
    .prepare(
      `SELECT COALESCE(SUM(balance), 0) AS total
         FROM (
           SELECT ROUND(SUM(debit) - SUM(credit), 2) AS balance
             FROM ledger_entries
            WHERE account_type = 'customer' AND date <= ?
            GROUP BY account_ref_id
         )
        WHERE balance > 0`,
    )
    .get(asOf).total;
  const supplierPayables = getDb()
    .prepare(
      `SELECT COALESCE(SUM(-balance), 0) AS total
         FROM (
           SELECT ROUND(SUM(debit) - SUM(credit), 2) AS balance
             FROM ledger_entries
            WHERE account_type = 'supplier' AND date <= ?
            GROUP BY account_ref_id
         )
        WHERE balance < 0`,
    )
    .get(asOf).total;
  const stockValue = round2(totalStockValue());
  const assets = [
    { name: "Cash", amount: cash },
    { name: "Bank", amount: bank },
    { name: "Stock value", amount: stockValue },
    { name: "Customer receivables", amount: round2(customerReceivables) },
  ];
  const liabilities = [{ name: "Supplier payables", amount: round2(supplierPayables) }];

  return {
    as_of: asOf,
    assets,
    liabilities,
    total_assets: round2(assets.reduce((sum, row) => sum + row.amount, 0)),
    total_liabilities: round2(liabilities.reduce((sum, row) => sum + row.amount, 0)),
    net_position: round2(
      assets.reduce((sum, row) => sum + row.amount, 0) - liabilities.reduce((sum, row) => sum + row.amount, 0),
    ),
  };
}

router.get("/daily-transactions", (req, res) => {
  const date = req.query.date || today();
  const rows = getDb()
    .prepare(
      `SELECT id, date, account_type, account_ref_id, debit, credit,
              source_type, source_id, description, created_at
         FROM ledger_entries
        WHERE date = ?
        ORDER BY source_type ASC, source_id ASC, id ASC`,
    )
    .all(date);

  const groups = rows.reduce((acc, row) => {
    if (!acc[row.source_type]) acc[row.source_type] = [];
    acc[row.source_type].push(row);
    return acc;
  }, {});

  res.json({ date, rows, groups });
});

/** Net profit = sales - cost of goods sold - expenses for a date range. */
function profitBetween(from, to) {
  return profitLossBetween(from, to).net_profit;
}

router.get("/trial-balance", (req, res) => {
  res.json(trialBalance(req.query.as_of || today()));
});

router.get("/profit-loss", (req, res) => {
  const from = req.query.from || monthStart();
  const to = req.query.to || today();
  res.json(profitLossBetween(from, to));
});

router.get("/balance-sheet", (req, res) => {
  res.json(balanceSheet(req.query.as_of || today()));
});

router.get("/", (req, res) => {
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
  const settings = Object.fromEntries(getDb().prepare(`SELECT key, value FROM settings`).all().map((r) => [r.key, r.value]));
  const backupFolderConfigured = Boolean(settings.last_backup_path);
  const showBackupBanner = !backupFolderConfigured && ["admin", "manager"].includes(req.user?.role);

  res.json({
    date: d,
    show_backup_banner: showBackupBanner,
    backup_folder_configured: backupFolderConfigured,
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
  const db = getDb();
  const settings = Object.fromEntries(db.prepare(`SELECT key, value FROM settings`).all().map((r) => [r.key, r.value]));
  const shop = {
    ...settings,
    shop_name: SHOP_NAME,
    shop_address: SHOP_ADDRESS,
    shop_phone: SHOP_PHONE,
    shop_email: SHOP_EMAIL,
  };
  res.json({
    account_type,
    balance: ledger.balanceOf(account_type, ref),
    entries: ledger.statement(account_type, ref, { from: req.query.from, to: req.query.to }),
    shop,
  });
});

router.get("/outstanding/:party", (req, res) => {
  const type = req.params.party === "suppliers" ? "supplier" : "customer";
  res.json(ledger.outstanding(type));
});

export default router;
