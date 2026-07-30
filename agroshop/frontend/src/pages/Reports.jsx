import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Download,
  PackageSearch,
  Printer,
  Receipt,
  Scale,
  ShoppingCart,
  TrendingUp,
  Users,
  Warehouse,
} from "lucide-react";
import { api, getToken, money, qty, todayStr } from "../api/client.js";
import DataTable from "../components/DataTable.jsx";
import MetricCard from "../components/MetricCard.jsx";
import { Alert, Field } from "../components/Modal.jsx";

const monthStart = () => {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};

const REPORTS = {
  sales: { label: "Sales", icon: Receipt, endpoint: "/reports/sales", dated: true, grouped: true },
  purchases: { label: "Purchases", icon: ShoppingCart, endpoint: "/reports/purchases", dated: true, grouped: true },
  stock: { label: "Stock", icon: Warehouse, endpoint: "/reports/stock" },
  profit: { label: "Profit", icon: TrendingUp, endpoint: "/reports/profit", dated: true, grouped: true },
  outstanding: { label: "Outstanding", icon: Users, endpoint: "/reports/outstanding", dated: true },
};

const n = (v) => Number(v || 0);
const amount = (v) => money(v);
const quantity = (v) => qty(v);

function queryFor(type, filters, format) {
  const report = REPORTS[type];
  const params = new URLSearchParams();
  if (report.dated) {
    params.set("from", filters.from);
    params.set("to", filters.to);
  }
  if (report.grouped) params.set("group", filters.group);
  if (type === "stock") params.set("expiry_days", filters.expiry_days);
  if (format) params.set("format", format);
  return `${report.endpoint}?${params.toString()}`;
}

function columnsFor(type, key) {
  const commonMoney = (field, header) => ({ key: field, header, align: "right", render: (r) => amount(r[field]), sortValue: (r) => n(r[field]) });
  const commonQty = (field, header = "Quantity") => ({ key: field, header, align: "right", render: (r) => quantity(r[field]), sortValue: (r) => n(r[field]) });

  const sets = {
    sales: {
      by_period: [{ key: "period", header: "Period" }, commonMoney("revenue", "Revenue"), commonQty("quantity"), { key: "invoice_count", header: "Invoices", align: "right" }],
      by_product: [{ key: "product_name", header: "Product" }, { key: "company", header: "Company" }, { key: "unit", header: "Unit" }, commonMoney("revenue", "Revenue"), commonQty("quantity"), { key: "invoice_count", header: "Invoices", align: "right" }],
      by_customer: [{ key: "customer_name", header: "Customer" }, { key: "mobile", header: "Mobile" }, commonMoney("revenue", "Revenue"), commonQty("quantity"), { key: "invoice_count", header: "Invoices", align: "right" }],
    },
    purchases: {
      by_period: [{ key: "period", header: "Period" }, commonMoney("amount", "Amount"), commonQty("quantity"), { key: "invoice_count", header: "Invoices", align: "right" }],
      by_product: [{ key: "product_name", header: "Product" }, { key: "company", header: "Company" }, { key: "unit", header: "Unit" }, commonMoney("amount", "Amount"), commonQty("quantity"), { key: "invoice_count", header: "Invoices", align: "right" }],
      by_supplier: [{ key: "supplier_name", header: "Supplier" }, { key: "contact", header: "Contact" }, commonMoney("amount", "Amount"), commonQty("quantity"), { key: "invoice_count", header: "Invoices", align: "right" }],
    },
    stock: {
      by_product: [{ key: "product_name", header: "Product" }, { key: "company", header: "Company" }, { key: "unit", header: "Unit" }, commonQty("current_stock", "Stock"), commonQty("min_stock_level", "Min"), commonMoney("stock_value", "Value")],
      by_batch: [{ key: "product_name", header: "Product" }, { key: "batch_number", header: "Batch" }, { key: "expiry_date", header: "Expiry" }, commonQty("quantity"), commonMoney("purchase_rate", "Cost"), commonMoney("stock_value", "Value")],
      near_expiry: [{ key: "product_name", header: "Product" }, { key: "batch_number", header: "Batch" }, { key: "expiry_date", header: "Expiry" }, commonQty("quantity"), commonMoney("stock_value", "Value")],
      low_stock: [{ key: "product_name", header: "Product" }, { key: "unit", header: "Unit" }, commonQty("current_stock", "Stock"), commonQty("min_stock_level", "Min"), commonMoney("stock_value", "Value")],
    },
    profit: {
      by_period: [{ key: "period", header: "Period" }, commonMoney("revenue", "Revenue"), commonMoney("cost_of_goods_sold", "COGS"), commonMoney("gross_profit", "Gross profit")],
      by_product: [{ key: "product_name", header: "Product" }, { key: "company", header: "Company" }, commonQty("quantity"), commonMoney("revenue", "Revenue"), commonMoney("cost_of_goods_sold", "COGS"), commonMoney("gross_profit", "Gross profit")],
    },
    outstanding: {
      receivables: agingColumns("Customer"),
      payables: agingColumns("Supplier"),
    },
  };
  return sets[type][key] || [];
}

function agingColumns(name) {
  const m = (field, header) => ({ key: field, header, align: "right", render: (r) => amount(r[field]), sortValue: (r) => n(r[field]) });
  return [
    { key: "name", header: name },
    { key: "contact", header: "Contact" },
    m("balance", "Balance"),
    m("current", "Current"),
    m("days_30", "31-60 days"),
    m("days_60", "61-90 days"),
    m("days_90_plus", "90+ days"),
  ];
}

function sectionsFor(type, data) {
  if (!data) return [];
  const titles = {
    by_period: "By period",
    by_product: "By product",
    by_customer: "By customer",
    by_supplier: "By supplier",
    by_batch: "By batch",
    near_expiry: "Near expiry",
    low_stock: "Low stock",
    receivables: "Customer receivables",
    payables: "Supplier payables",
  };
  const keys = {
    sales: ["by_period", "by_product", "by_customer"],
    purchases: ["by_period", "by_product", "by_supplier"],
    stock: ["by_product", "by_batch", "near_expiry", "low_stock"],
    profit: ["by_period", "by_product"],
    outstanding: ["receivables", "payables"],
  }[type];
  return keys.map((key) => ({ key, title: titles[key], rows: data[key] || [], columns: columnsFor(type, key) }));
}

function metricsFor(type, data) {
  if (!data) return [];
  const t = data.totals || {};
  if (type === "sales") {
    return [
      { label: "Revenue", value: amount(t.revenue), icon: Receipt, tone: "good" },
      { label: "Quantity sold", value: quantity(t.quantity), icon: PackageSearch },
      { label: "Invoices", value: t.invoice_count || 0, icon: Scale },
    ];
  }
  if (type === "purchases") {
    return [
      { label: "Purchase amount", value: amount(t.amount), icon: ShoppingCart },
      { label: "Quantity bought", value: quantity(t.quantity), icon: PackageSearch },
      { label: "Invoices", value: t.invoice_count || 0, icon: Scale },
    ];
  }
  if (type === "stock") {
    return [
      { label: "Stock value", value: amount(t.stock_value), icon: Warehouse },
      { label: "Products", value: t.product_count || 0, icon: PackageSearch },
      { label: "Low stock", value: t.low_stock_count || 0, icon: Scale, tone: t.low_stock_count ? "warn" : "neutral" },
      { label: "Near expiry", value: t.near_expiry_count || 0, icon: CalendarClock, tone: t.near_expiry_count ? "bad" : "neutral" },
    ];
  }
  if (type === "profit") {
    return [
      { label: "Revenue", value: amount(t.revenue), icon: Receipt },
      { label: "Cost of goods", value: amount(t.cost_of_goods_sold), icon: ShoppingCart },
      { label: "Gross profit", value: amount(t.gross_profit), icon: TrendingUp, tone: n(t.gross_profit) >= 0 ? "good" : "bad" },
    ];
  }
  return [
    { label: "Receivables", value: amount(t.receivables?.balance), icon: Users, tone: "warn" },
    { label: "Payables", value: amount(t.payables?.balance), icon: ShoppingCart, tone: "bad" },
    { label: "Receivable 90+", value: amount(t.receivables?.days_90_plus), icon: CalendarClock, tone: t.receivables?.days_90_plus ? "bad" : "neutral" },
    { label: "Payable 90+", value: amount(t.payables?.days_90_plus), icon: CalendarClock, tone: t.payables?.days_90_plus ? "bad" : "neutral" },
  ];
}

function displayValue(row, col) {
  if (col.render) {
    if (/amount|revenue|cost|profit|value|balance|current|days_/.test(col.key)) return amount(row[col.key]);
    if (/quantity|stock|level/.test(col.key)) return quantity(row[col.key]);
  }
  return row[col.key] ?? "-";
}

function ReportPrint({ type, data, filters, sections, onBack }) {
  useEffect(() => {
    const timer = window.setTimeout(() => window.print(), 100);
    return () => window.clearTimeout(timer);
  }, []);

  const title = `${REPORTS[type].label} report`;
  const period = type === "stock" ? `Expiry threshold: ${filters.expiry_days} days` : `${filters.from} to ${filters.to}`;

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <button className="btn-ghost" onClick={onBack}>Back</button>
        <button className="btn-primary" onClick={() => window.print()}><Printer size={16} /> Print</button>
      </div>
      <div className="mx-auto max-w-[190mm] bg-white p-6 text-[12px] text-slate-800">
        <div className="flex items-start justify-between border-b-2 border-slate-800 pb-3">
          <div>
            <h1 className="text-xl font-bold uppercase tracking-wide">AgroShop</h1>
            <p className="text-xs text-slate-600">Reports & Analytics</p>
          </div>
          <div className="text-right text-xs">
            <p className="text-base font-semibold uppercase">{title}</p>
            <p>{period}</p>
            {data?.group && <p className="capitalize">Grouped by {data.group}</p>}
            {data?.as_of && <p>As of {data.as_of}</p>}
          </div>
        </div>
        {sections.map((section) => (
          <div key={section.key} className="mt-5">
            <h2 className="mb-2 text-sm font-semibold">{section.title}</h2>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-100">
                  {section.columns.map((col) => (
                    <th key={col.key} className={`border border-slate-300 px-2 py-1.5 ${col.align === "right" ? "text-right" : "text-left"}`}>{col.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row, i) => (
                  <tr key={`${section.key}-${row.id || row.product_id || row.batch_id || row.period || i}`}>
                    {section.columns.map((col) => (
                      <td key={col.key} className={`border border-slate-300 px-2 py-1.5 ${col.align === "right" ? "text-right tabular-nums" : ""}`}>{displayValue(row, col)}</td>
                    ))}
                  </tr>
                ))}
                {!section.rows.length && (
                  <tr>
                    <td colSpan={section.columns.length} className="border border-slate-300 px-2 py-6 text-center text-slate-500">No rows found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Reports() {
  const [active, setActive] = useState("sales");
  const [filters, setFilters] = useState({ from: monthStart(), to: todayStr(), group: "day", expiry_days: "90" });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);

  const sections = useMemo(() => sectionsFor(active, data), [active, data]);

  function load() {
    setLoading(true);
    setError("");
    api
      .get(queryFor(active, filters))
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setPrinting(false);
    load();
  }, [active]);

  async function exportCsv() {
    setError("");
    try {
      const res = await fetch(`/api${queryFor(active, filters, "csv")}`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      });
      if (!res.ok) throw new Error(`CSV export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${active}-report.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    }
  }

  if (printing && data) {
    return <ReportPrint type={active} data={data} filters={filters} sections={sections} onBack={() => setPrinting(false)} />;
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Reports & Analytics</h1>
          <p className="text-sm text-slate-500">Sales, purchases, stock, profit and outstanding balances.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={exportCsv} disabled={!data}><Download size={16} /> Export CSV</button>
          <button className="btn-primary" onClick={() => setPrinting(true)} disabled={!data}><Printer size={16} /> Print</button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {Object.entries(REPORTS).map(([key, report]) => {
          const Icon = report.icon;
          return (
            <button
              key={key}
              className={`btn-ghost ${active === key ? "border-brand-200 bg-brand-50 text-brand-700" : ""}`}
              onClick={() => setActive(key)}
            >
              <Icon size={16} /> {report.label}
            </button>
          );
        })}
      </div>

      <Alert message={error} />

      <div className="card p-4">
        <div className="grid gap-3 md:grid-cols-5">
          {REPORTS[active].dated && (
            <>
              <Field label={active === "outstanding" ? "From" : "From"}>
                <input className="input" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
              </Field>
              <Field label={active === "outstanding" ? "As of" : "To"}>
                <input className="input" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
              </Field>
            </>
          )}
          {REPORTS[active].grouped && (
            <Field label="Group">
              <select className="input" value={filters.group} onChange={(e) => setFilters({ ...filters, group: e.target.value })}>
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
            </Field>
          )}
          {active === "stock" && (
            <Field label="Expiry">
              <select className="input" value={filters.expiry_days} onChange={(e) => setFilters({ ...filters, expiry_days: e.target.value })}>
                <option value="30">Next 30 days</option>
                <option value="60">Next 60 days</option>
                <option value="90">Next 90 days</option>
              </select>
            </Field>
          )}
          <div className="flex items-end">
            <button className="btn-primary w-full" onClick={load} disabled={loading}>
              {loading ? "Loading..." : "Run report"}
            </button>
          </div>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading...</p>}

      {data && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metricsFor(active, data).map((metric) => <MetricCard key={metric.label} {...metric} />)}
          </section>

          <section className="space-y-4">
            {sections.map((section) => (
              <div key={section.key} className="card p-4">
                <h2 className="mb-3 text-sm font-semibold text-slate-700">{section.title}</h2>
                <DataTable
                  columns={section.columns}
                  rows={section.rows}
                  searchKeys={section.columns.filter((c) => c.align !== "right").map((c) => c.key)}
                  empty="No rows found."
                  rowKey={(row) => `${section.key}-${row.id || row.product_id || row.batch_id || row.customer_id || row.supplier_id || row.period || row.name}`}
                />
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
