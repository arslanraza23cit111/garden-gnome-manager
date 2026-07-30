import { Router } from "express";
import { getDb } from "../db/connection.js";
import { logActivity } from "../lib/auth.js";
import { monthStart, num, round2, today } from "../lib/util.js";

const router = Router();

const one = (sql, ...p) => getDb().prepare(sql).get(...p);
const all = (sql, ...p) => getDb().prepare(sql).all(...p);

function dateRange(req) {
  return { from: req.query.from || monthStart(), to: req.query.to || today() };
}

function periodExpr(group, alias = "date") {
  if (group === "week") return `strftime('%Y-W%W', ${alias})`;
  if (group === "month") return `substr(${alias}, 1, 7)`;
  return alias;
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function sectionToCsv({ title, columns, rows }) {
  return [
    title,
    columns.map((c) => csvValue(c.header)).join(","),
    ...rows.map((row) => columns.map((c) => csvValue(c.value(row))).join(",")),
  ].join("\n");
}

function sendReport(req, res, name, data, sections) {
  if (req.query.format === "csv") {
    logActivity(req.user?.id, "export", "reports", null, name);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${name}.csv"`);
    return res.send(sections.map(sectionToCsv).join("\n\n"));
  }
  return res.json(data);
}

const moneyCol = (key, header) => ({ header, value: (row) => row[key] });
const textCol = (key, header) => ({ header, value: (row) => row[key] });

function salesReport(req) {
  const { from, to } = dateRange(req);
  const group = ["day", "week", "month"].includes(req.query.group) ? req.query.group : "day";
  const period = periodExpr(group, "s.date");
  const totals = one(
    `SELECT COUNT(*) AS invoice_count,
            COALESCE(SUM(total_amount), 0) AS revenue,
            (SELECT COALESCE(SUM(i.quantity), 0)
               FROM sale_items i JOIN sales sx ON sx.id = i.sale_id
              WHERE sx.status = 'posted' AND sx.date BETWEEN ? AND ?) AS quantity
       FROM sales
      WHERE status = 'posted' AND date BETWEEN ? AND ?`,
    from,
    to,
    from,
    to,
  );
  const byPeriod = all(
    `SELECT ${period} AS period,
            COUNT(DISTINCT s.id) AS invoice_count,
            ROUND(COALESCE(SUM(i.quantity), 0), 2) AS quantity,
            ROUND(COALESCE(SUM(i.line_total), 0), 2) AS revenue
       FROM sales s
       LEFT JOIN sale_items i ON i.sale_id = s.id
      WHERE s.status = 'posted' AND s.date BETWEEN ? AND ?
      GROUP BY period
      ORDER BY period`,
    from,
    to,
  );
  const byProduct = all(
    `SELECT p.id AS product_id, p.name AS product_name, p.company, p.unit,
            COUNT(DISTINCT s.id) AS invoice_count,
            ROUND(COALESCE(SUM(i.quantity), 0), 2) AS quantity,
            ROUND(COALESCE(SUM(i.line_total), 0), 2) AS revenue
       FROM sale_items i
       JOIN sales s ON s.id = i.sale_id
       JOIN products p ON p.id = i.product_id
      WHERE s.status = 'posted' AND s.date BETWEEN ? AND ?
      GROUP BY p.id
      ORDER BY revenue DESC, p.name`,
    from,
    to,
  );
  const byCustomer = all(
    `SELECT c.id AS customer_id, c.name AS customer_name, c.mobile,
            COUNT(DISTINCT s.id) AS invoice_count,
            ROUND(COALESCE(SUM(i.quantity), 0), 2) AS quantity,
            ROUND(COALESCE(SUM(s.total_amount), 0), 2) AS revenue
       FROM sales s
       JOIN customers c ON c.id = s.customer_id
       LEFT JOIN (SELECT sale_id, SUM(quantity) AS quantity FROM sale_items GROUP BY sale_id) i ON i.sale_id = s.id
      WHERE s.status = 'posted' AND s.date BETWEEN ? AND ?
      GROUP BY c.id
      ORDER BY revenue DESC, c.name`,
    from,
    to,
  );
  return {
    from,
    to,
    group,
    totals: {
      invoice_count: totals.invoice_count,
      quantity: round2(totals.quantity),
      revenue: round2(totals.revenue),
    },
    by_period: byPeriod,
    by_product: byProduct,
    by_customer: byCustomer,
  };
}

function purchasesReport(req) {
  const { from, to } = dateRange(req);
  const group = ["day", "week", "month"].includes(req.query.group) ? req.query.group : "day";
  const period = periodExpr(group, "p.date");
  const totals = one(
    `SELECT COUNT(*) AS invoice_count,
            COALESCE(SUM(total_amount), 0) AS amount,
            (SELECT COALESCE(SUM(i.quantity), 0)
               FROM purchase_items i JOIN purchases px ON px.id = i.purchase_id
              WHERE px.status = 'posted' AND px.date BETWEEN ? AND ?) AS quantity
       FROM purchases
      WHERE status = 'posted' AND date BETWEEN ? AND ?`,
    from,
    to,
    from,
    to,
  );
  const byPeriod = all(
    `SELECT ${period} AS period,
            COUNT(DISTINCT p.id) AS invoice_count,
            ROUND(COALESCE(SUM(i.quantity), 0), 2) AS quantity,
            ROUND(COALESCE(SUM(i.line_total), 0), 2) AS amount
       FROM purchases p
       LEFT JOIN purchase_items i ON i.purchase_id = p.id
      WHERE p.status = 'posted' AND p.date BETWEEN ? AND ?
      GROUP BY period
      ORDER BY period`,
    from,
    to,
  );
  const byProduct = all(
    `SELECT pr.id AS product_id, pr.name AS product_name, pr.company, pr.unit,
            COUNT(DISTINCT p.id) AS invoice_count,
            ROUND(COALESCE(SUM(i.quantity), 0), 2) AS quantity,
            ROUND(COALESCE(SUM(i.line_total), 0), 2) AS amount
       FROM purchase_items i
       JOIN purchases p ON p.id = i.purchase_id
       JOIN products pr ON pr.id = i.product_id
      WHERE p.status = 'posted' AND p.date BETWEEN ? AND ?
      GROUP BY pr.id
      ORDER BY amount DESC, pr.name`,
    from,
    to,
  );
  const bySupplier = all(
    `SELECT s.id AS supplier_id, s.name AS supplier_name, s.contact,
            COUNT(DISTINCT p.id) AS invoice_count,
            ROUND(COALESCE(SUM(i.quantity), 0), 2) AS quantity,
            ROUND(COALESCE(SUM(p.total_amount), 0), 2) AS amount
       FROM purchases p
       JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN (SELECT purchase_id, SUM(quantity) AS quantity FROM purchase_items GROUP BY purchase_id) i ON i.purchase_id = p.id
      WHERE p.status = 'posted' AND p.date BETWEEN ? AND ?
      GROUP BY s.id
      ORDER BY amount DESC, s.name`,
    from,
    to,
  );
  return {
    from,
    to,
    group,
    totals: {
      invoice_count: totals.invoice_count,
      quantity: round2(totals.quantity),
      amount: round2(totals.amount),
    },
    by_period: byPeriod,
    by_product: byProduct,
    by_supplier: bySupplier,
  };
}

function stockReport(req) {
  const thresholdDays = Math.max(1, num(req.query.expiry_days, 90));
  const limit = new Date(Date.now() + thresholdDays * 86400000).toISOString().slice(0, 10);
  const byProduct = all(
    `SELECT p.id AS product_id, p.name AS product_name, p.company, p.unit, p.min_stock_level,
            ROUND(COALESCE(SUM(b.quantity), 0), 2) AS current_stock,
            ROUND(COALESCE(SUM(b.quantity * b.purchase_rate), 0), 2) AS stock_value
       FROM products p
       LEFT JOIN product_batches b ON b.product_id = p.id
      GROUP BY p.id
      ORDER BY p.name`,
  );
  const byBatch = all(
    `SELECT b.id AS batch_id, b.batch_number, b.expiry_date,
            p.id AS product_id, p.name AS product_name, p.company, p.unit,
            ROUND(b.quantity, 2) AS quantity,
            ROUND(b.purchase_rate, 2) AS purchase_rate,
            ROUND(b.quantity * b.purchase_rate, 2) AS stock_value
       FROM product_batches b
       JOIN products p ON p.id = b.product_id
      WHERE b.quantity <> 0
      ORDER BY p.name, (b.expiry_date IS NULL), b.expiry_date, b.id`,
  );
  const nearExpiry = all(
    `SELECT b.id AS batch_id, b.batch_number, b.expiry_date,
            p.id AS product_id, p.name AS product_name, p.company, p.unit,
            ROUND(b.quantity, 2) AS quantity,
            ROUND(b.quantity * b.purchase_rate, 2) AS stock_value
       FROM product_batches b
       JOIN products p ON p.id = b.product_id
      WHERE b.quantity > 0 AND b.expiry_date IS NOT NULL AND b.expiry_date <= ?
      ORDER BY b.expiry_date ASC, p.name`,
    limit,
  );
  const lowStock = byProduct.filter((row) => Number(row.current_stock) <= Number(row.min_stock_level));
  const totals = {
    product_count: byProduct.length,
    batch_count: byBatch.length,
    stock_value: round2(byProduct.reduce((sum, row) => sum + Number(row.stock_value || 0), 0)),
    low_stock_count: lowStock.length,
    near_expiry_count: nearExpiry.length,
  };
  return { expiry_days: thresholdDays, expiry_limit: limit, totals, by_product: byProduct, by_batch: byBatch, near_expiry: nearExpiry, low_stock: lowStock };
}

function profitReport(req) {
  const { from, to } = dateRange(req);
  const group = ["day", "week", "month"].includes(req.query.group) ? req.query.group : "day";
  const period = periodExpr(group, "s.date");
  const byPeriod = all(
    `SELECT ${period} AS period,
            ROUND(COALESCE(SUM(i.line_total), 0), 2) AS revenue,
            ROUND(COALESCE(SUM(i.cost_rate * i.quantity), 0), 2) AS cost_of_goods_sold,
            ROUND(COALESCE(SUM(i.line_total - (i.cost_rate * i.quantity)), 0), 2) AS gross_profit
       FROM sale_items i
       JOIN sales s ON s.id = i.sale_id
      WHERE s.status = 'posted' AND s.date BETWEEN ? AND ?
      GROUP BY period
      ORDER BY period`,
    from,
    to,
  );
  const totals = byPeriod.reduce(
    (acc, row) => ({
      revenue: round2(acc.revenue + row.revenue),
      cost_of_goods_sold: round2(acc.cost_of_goods_sold + row.cost_of_goods_sold),
      gross_profit: round2(acc.gross_profit + row.gross_profit),
    }),
    { revenue: 0, cost_of_goods_sold: 0, gross_profit: 0 },
  );
  const byProduct = all(
    `SELECT p.id AS product_id, p.name AS product_name, p.company, p.unit,
            ROUND(COALESCE(SUM(i.quantity), 0), 2) AS quantity,
            ROUND(COALESCE(SUM(i.line_total), 0), 2) AS revenue,
            ROUND(COALESCE(SUM(i.cost_rate * i.quantity), 0), 2) AS cost_of_goods_sold,
            ROUND(COALESCE(SUM(i.line_total - (i.cost_rate * i.quantity)), 0), 2) AS gross_profit
       FROM sale_items i
       JOIN sales s ON s.id = i.sale_id
       JOIN products p ON p.id = i.product_id
      WHERE s.status = 'posted' AND s.date BETWEEN ? AND ?
      GROUP BY p.id
      ORDER BY gross_profit DESC, p.name`,
    from,
    to,
  );
  return { from, to, group, totals, by_period: byPeriod, by_product: byProduct };
}

function allocateAging(accountType, asOf) {
  const table = accountType === "customer" ? "customers" : "suppliers";
  const contactCol = accountType === "customer" ? "mobile" : "contact";
  const sign = accountType === "customer" ? 1 : -1;
  const rows = all(
    `SELECT t.id, t.name, t.${contactCol} AS contact,
            ROUND(COALESCE(SUM(l.debit - l.credit), 0), 2) AS raw_balance
       FROM ${table} t
       JOIN ledger_entries l ON l.account_type = ? AND l.account_ref_id = t.id AND l.date <= ?
      GROUP BY t.id
     HAVING ROUND(raw_balance * ?, 2) > 0
      ORDER BY ABS(raw_balance) DESC`,
    accountType,
    asOf,
    sign,
  );

  return rows.map((party) => {
    const entries = all(
      `SELECT date, debit, credit, source_type, source_id, description
         FROM ledger_entries
        WHERE account_type = ? AND account_ref_id = ? AND date <= ?
        ORDER BY date DESC, id DESC`,
      accountType,
      party.id,
      asOf,
    );
    let remaining = round2(party.raw_balance * sign);
    const buckets = { current: 0, days_30: 0, days_60: 0, days_90_plus: 0 };
    for (const entry of entries) {
      if (remaining <= 0) break;
      const amount = accountType === "customer" ? entry.debit - entry.credit : entry.credit - entry.debit;
      if (amount <= 0) continue;
      const age = Math.floor((new Date(`${asOf}T00:00:00Z`) - new Date(`${entry.date}T00:00:00Z`)) / 86400000);
      const applied = Math.min(remaining, amount);
      if (age <= 30) buckets.current = round2(buckets.current + applied);
      else if (age <= 60) buckets.days_30 = round2(buckets.days_30 + applied);
      else if (age <= 90) buckets.days_60 = round2(buckets.days_60 + applied);
      else buckets.days_90_plus = round2(buckets.days_90_plus + applied);
      remaining = round2(remaining - applied);
    }
    return {
      id: party.id,
      name: party.name,
      contact: party.contact,
      balance: round2(party.raw_balance * sign),
      ...buckets,
    };
  });
}

function outstandingReport(req) {
  const asOf = req.query.to || req.query.as_of || today();
  const receivables = allocateAging("customer", asOf);
  const payables = allocateAging("supplier", asOf);
  const sumRows = (rows) =>
    rows.reduce(
      (acc, row) => ({
        balance: round2(acc.balance + row.balance),
        current: round2(acc.current + row.current),
        days_30: round2(acc.days_30 + row.days_30),
        days_60: round2(acc.days_60 + row.days_60),
        days_90_plus: round2(acc.days_90_plus + row.days_90_plus),
      }),
      { balance: 0, current: 0, days_30: 0, days_60: 0, days_90_plus: 0 },
    );
  return { as_of: asOf, receivables, payables, totals: { receivables: sumRows(receivables), payables: sumRows(payables) } };
}

router.get("/sales", (req, res) => {
  const data = salesReport(req);
  sendReport(req, res, "sales-report", data, [
    { title: "Totals", columns: [moneyCol("revenue", "Revenue"), textCol("quantity", "Quantity"), textCol("invoice_count", "Invoices")], rows: [data.totals] },
    { title: "By period", columns: [textCol("period", "Period"), moneyCol("revenue", "Revenue"), textCol("quantity", "Quantity"), textCol("invoice_count", "Invoices")], rows: data.by_period },
    { title: "By product", columns: [textCol("product_name", "Product"), textCol("company", "Company"), textCol("unit", "Unit"), moneyCol("revenue", "Revenue"), textCol("quantity", "Quantity"), textCol("invoice_count", "Invoices")], rows: data.by_product },
    { title: "By customer", columns: [textCol("customer_name", "Customer"), textCol("mobile", "Mobile"), moneyCol("revenue", "Revenue"), textCol("quantity", "Quantity"), textCol("invoice_count", "Invoices")], rows: data.by_customer },
  ]);
});

router.get("/purchases", (req, res) => {
  const data = purchasesReport(req);
  sendReport(req, res, "purchases-report", data, [
    { title: "Totals", columns: [moneyCol("amount", "Amount"), textCol("quantity", "Quantity"), textCol("invoice_count", "Invoices")], rows: [data.totals] },
    { title: "By period", columns: [textCol("period", "Period"), moneyCol("amount", "Amount"), textCol("quantity", "Quantity"), textCol("invoice_count", "Invoices")], rows: data.by_period },
    { title: "By product", columns: [textCol("product_name", "Product"), textCol("company", "Company"), textCol("unit", "Unit"), moneyCol("amount", "Amount"), textCol("quantity", "Quantity"), textCol("invoice_count", "Invoices")], rows: data.by_product },
    { title: "By supplier", columns: [textCol("supplier_name", "Supplier"), textCol("contact", "Contact"), moneyCol("amount", "Amount"), textCol("quantity", "Quantity"), textCol("invoice_count", "Invoices")], rows: data.by_supplier },
  ]);
});

router.get("/stock", (req, res) => {
  const data = stockReport(req);
  sendReport(req, res, "stock-report", data, [
    { title: "By product", columns: [textCol("product_name", "Product"), textCol("company", "Company"), textCol("unit", "Unit"), textCol("current_stock", "Stock"), textCol("min_stock_level", "Min level"), moneyCol("stock_value", "Stock value")], rows: data.by_product },
    { title: "By batch", columns: [textCol("product_name", "Product"), textCol("batch_number", "Batch"), textCol("expiry_date", "Expiry"), textCol("quantity", "Quantity"), moneyCol("purchase_rate", "Cost"), moneyCol("stock_value", "Stock value")], rows: data.by_batch },
    { title: "Near expiry", columns: [textCol("product_name", "Product"), textCol("batch_number", "Batch"), textCol("expiry_date", "Expiry"), textCol("quantity", "Quantity"), moneyCol("stock_value", "Stock value")], rows: data.near_expiry },
    { title: "Low stock", columns: [textCol("product_name", "Product"), textCol("unit", "Unit"), textCol("current_stock", "Stock"), textCol("min_stock_level", "Min level"), moneyCol("stock_value", "Stock value")], rows: data.low_stock },
  ]);
});

router.get("/profit", (req, res) => {
  const data = profitReport(req);
  sendReport(req, res, "profit-report", data, [
    { title: "Totals", columns: [moneyCol("revenue", "Revenue"), moneyCol("cost_of_goods_sold", "COGS"), moneyCol("gross_profit", "Gross profit")], rows: [data.totals] },
    { title: "By period", columns: [textCol("period", "Period"), moneyCol("revenue", "Revenue"), moneyCol("cost_of_goods_sold", "COGS"), moneyCol("gross_profit", "Gross profit")], rows: data.by_period },
    { title: "By product", columns: [textCol("product_name", "Product"), textCol("company", "Company"), textCol("quantity", "Quantity"), moneyCol("revenue", "Revenue"), moneyCol("cost_of_goods_sold", "COGS"), moneyCol("gross_profit", "Gross profit")], rows: data.by_product },
  ]);
});

router.get("/outstanding", (req, res) => {
  const data = outstandingReport(req);
  const cols = [textCol("name", "Name"), textCol("contact", "Contact"), moneyCol("balance", "Balance"), moneyCol("current", "Current"), moneyCol("days_30", "31-60 days"), moneyCol("days_60", "61-90 days"), moneyCol("days_90_plus", "90+ days")];
  sendReport(req, res, "outstanding-report", data, [
    { title: "Customer receivables", columns: cols, rows: data.receivables },
    { title: "Supplier payables", columns: cols, rows: data.payables },
  ]);
});

export default router;
