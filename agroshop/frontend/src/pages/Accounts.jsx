import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Landmark, Scale, TrendingUp, Users, Wallet } from "lucide-react";
import { api, money, todayStr } from "../api/client.js";
import { Alert, Field } from "../components/Modal.jsx";

const REPORTS = [
  { key: "customer", label: "Customer ledger", icon: Users },
  { key: "supplier", label: "Supplier ledger", icon: Users },
  { key: "cash", label: "Cash ledger", icon: Wallet },
  { key: "bank", label: "Bank ledger", icon: Landmark },
  { key: "daily", label: "Daily transactions", icon: Download },
  { key: "trial", label: "Trial Balance", icon: Scale },
  { key: "profit-loss", label: "Profit & Loss", icon: TrendingUp },
  { key: "balance-sheet", label: "Balance Sheet", icon: FileText },
];

const LEDGER_REPORTS = ["customer", "supplier", "cash", "bank"];

const csvValue = (value) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function downloadCsv(filename, columns, rows) {
  const lines = [
    columns.map((c) => csvValue(c.header)).join(","),
    ...rows.map((row) => columns.map((c) => csvValue(c.value(row))).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function EntryTable({ rows, showSource = true }) {
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Date</th>
            <th>Account</th>
            <th>Description</th>
            {showSource && <th>Source</th>}
            <th className="text-right">Debit</th>
            <th className="text-right">Credit</th>
            <th className="text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.date}</td>
              <td>
                {row.account_type}
                {row.account_ref_id ? ` #${row.account_ref_id}` : ""}
              </td>
              <td>{row.description || "-"}</td>
              {showSource && (
                <td>
                  {row.source_type}
                  {row.source_id ? ` #${row.source_id}` : ""}
                </td>
              )}
              <td className="text-right tabular-nums">{row.debit ? money(row.debit) : "-"}</td>
              <td className="text-right tabular-nums">{row.credit ? money(row.credit) : "-"}</td>
              <td className="text-right tabular-nums">{row.balance === undefined ? "-" : money(row.balance)}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={showSource ? 7 : 6} className="py-10 text-center text-sm text-slate-500">
                No ledger entries found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function DailyTable({ rows }) {
  return (
    <div className="space-y-4">
      {rows.map(([sourceType, entries]) => (
        <section key={sourceType} className="space-y-2">
          <h2 className="text-sm font-semibold capitalize text-slate-700">{sourceType.replace("_", " ")}</h2>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Account</th>
                  <th>Description</th>
                  <th className="text-right">Debit</th>
                  <th className="text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((row) => (
                  <tr key={row.id}>
                    <td>{row.source_id ? `#${row.source_id}` : "-"}</td>
                    <td>
                      {row.account_type}
                      {row.account_ref_id ? ` #${row.account_ref_id}` : ""}
                    </td>
                    <td>{row.description || "-"}</td>
                    <td className="text-right tabular-nums">{row.debit ? money(row.debit) : "-"}</td>
                    <td className="text-right tabular-nums">{row.credit ? money(row.credit) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {!rows.length && <div className="table-wrap py-10 text-center text-sm text-slate-500">No transactions found for this day.</div>}
    </div>
  );
}

function TrialBalanceTable({ data }) {
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Account</th>
            <th>Type</th>
            <th className="text-right">Debit</th>
            <th className="text-right">Credit</th>
            <th className="text-right">Net balance</th>
          </tr>
        </thead>
        <tbody>
          {(data.rows || []).map((row) => (
            <tr key={`${row.account_type}-${row.account_ref_id || "all"}`}>
              <td>{row.account_name}</td>
              <td>{row.account_type}</td>
              <td className="text-right tabular-nums">{money(row.debit)}</td>
              <td className="text-right tabular-nums">{money(row.credit)}</td>
              <td className="text-right tabular-nums">{money(row.balance)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td>Total</td>
            <td />
            <td className="text-right tabular-nums">{money(data.totals?.debit)}</td>
            <td className="text-right tabular-nums">{money(data.totals?.credit)}</td>
            <td className="text-right tabular-nums">{money(data.totals?.balance)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ProfitLossTable({ data }) {
  const rows = [
    ["Revenue", data.revenue],
    ["Cost of goods sold", -data.cost_of_goods_sold],
    ["Gross profit", data.gross_profit],
    ["Expenses", -data.expenses],
    ["Net profit", data.net_profit],
  ];
  return (
    <div className="table-wrap">
      <table className="tbl">
        <tbody>
          {rows.map(([label, amount]) => (
            <tr key={label} className={label === "Net profit" ? "font-semibold" : ""}>
              <td>{label}</td>
              <td className="text-right tabular-nums">{money(amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BalanceSheetTable({ data }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Assets</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(data.assets || []).map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td className="text-right tabular-nums">{money(row.amount)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td>Total assets</td>
              <td className="text-right tabular-nums">{money(data.total_assets)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Liabilities</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(data.liabilities || []).map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td className="text-right tabular-nums">{money(row.amount)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td>Total liabilities</td>
              <td className="text-right tabular-nums">{money(data.total_liabilities)}</td>
            </tr>
            <tr className="font-semibold">
              <td>Net position</td>
              <td className="text-right tabular-nums">{money(data.net_position)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Accounts() {
  const [active, setActive] = useState("customer");
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [day, setDay] = useState(todayStr());
  const [asOf, setAsOf] = useState(todayStr());
  const [statement, setStatement] = useState({ entries: [], balance: 0 });
  const [daily, setDaily] = useState({ rows: [], groups: {} });
  const [trialBalance, setTrialBalance] = useState({ rows: [], totals: {} });
  const [profitLoss, setProfitLoss] = useState({});
  const [balanceSheet, setBalanceSheet] = useState({ assets: [], liabilities: [] });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.get("/customers"), api.get("/suppliers")])
      .then(([customerRows, supplierRows]) => {
        setCustomers(customerRows);
        setSuppliers(supplierRows);
        setSelectedCustomer(customerRows[0]?.id ? String(customerRows[0].id) : "");
        setSelectedSupplier(supplierRows[0]?.id ? String(supplierRows[0].id) : "");
      })
      .catch((e) => setError(e.message));
  }, []);

  const statementPath = useMemo(() => {
    if (!LEDGER_REPORTS.includes(active)) return "";
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (active === "customer") {
      if (!selectedCustomer) return "";
      params.set("ref", selectedCustomer);
      return `/dashboard/ledger/customer?${params.toString()}`;
    }
    if (active === "supplier") {
      if (!selectedSupplier) return "";
      params.set("ref", selectedSupplier);
      return `/dashboard/ledger/supplier?${params.toString()}`;
    }
    return `/dashboard/ledger/${active}?${params.toString()}`;
  }, [active, from, selectedCustomer, selectedSupplier, to]);

  useEffect(() => {
    if (!LEDGER_REPORTS.includes(active) || !statementPath) return;
    setLoading(true);
    setError("");
    api
      .get(statementPath)
      .then(setStatement)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [active, statementPath]);

  useEffect(() => {
    if (active !== "daily") return;
    setLoading(true);
    setError("");
    api
      .get(`/dashboard/daily-transactions?date=${encodeURIComponent(day)}`)
      .then(setDaily)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [active, day]);

  useEffect(() => {
    if (active !== "trial") return;
    setLoading(true);
    setError("");
    api
      .get(`/dashboard/trial-balance?as_of=${encodeURIComponent(asOf)}`)
      .then(setTrialBalance)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [active, asOf]);

  useEffect(() => {
    if (active !== "profit-loss") return;
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    api
      .get(`/dashboard/profit-loss?${params.toString()}`)
      .then(setProfitLoss)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [active, from, to]);

  useEffect(() => {
    if (active !== "balance-sheet") return;
    setLoading(true);
    setError("");
    api
      .get(`/dashboard/balance-sheet?as_of=${encodeURIComponent(asOf)}`)
      .then(setBalanceSheet)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [active, asOf]);

  const groupedDaily = useMemo(() => Object.entries(daily.groups || {}), [daily]);

  function exportStatement() {
    downloadCsv(`${active}-ledger.csv`, [
      { header: "Date", value: (r) => r.date },
      { header: "Account type", value: (r) => r.account_type },
      { header: "Account ref", value: (r) => r.account_ref_id },
      { header: "Description", value: (r) => r.description },
      { header: "Source type", value: (r) => r.source_type },
      { header: "Source id", value: (r) => r.source_id },
      { header: "Debit", value: (r) => r.debit },
      { header: "Credit", value: (r) => r.credit },
      { header: "Balance", value: (r) => r.balance },
    ], statement.entries || []);
  }

  function exportDaily() {
    downloadCsv(`daily-transactions-${day}.csv`, [
      { header: "Date", value: (r) => r.date },
      { header: "Source type", value: (r) => r.source_type },
      { header: "Source id", value: (r) => r.source_id },
      { header: "Account type", value: (r) => r.account_type },
      { header: "Account ref", value: (r) => r.account_ref_id },
      { header: "Description", value: (r) => r.description },
      { header: "Debit", value: (r) => r.debit },
      { header: "Credit", value: (r) => r.credit },
    ], daily.rows || []);
  }

  function exportTrialBalance() {
    downloadCsv(`trial-balance-${asOf}.csv`, [
      { header: "Account", value: (r) => r.account_name },
      { header: "Type", value: (r) => r.account_type },
      { header: "Debit", value: (r) => r.debit },
      { header: "Credit", value: (r) => r.credit },
      { header: "Net balance", value: (r) => r.balance },
    ], trialBalance.rows || []);
  }

  function exportProfitLoss() {
    downloadCsv(`profit-loss-${from || "start"}-${to || "today"}.csv`, [
      { header: "Line", value: (r) => r.label },
      { header: "Amount", value: (r) => r.amount },
    ], [
      { label: "Revenue", amount: profitLoss.revenue },
      { label: "Cost of goods sold", amount: -profitLoss.cost_of_goods_sold },
      { label: "Gross profit", amount: profitLoss.gross_profit },
      { label: "Expenses", amount: -profitLoss.expenses },
      { label: "Net profit", amount: profitLoss.net_profit },
    ]);
  }

  function exportBalanceSheet() {
    downloadCsv(`balance-sheet-${asOf}.csv`, [
      { header: "Section", value: (r) => r.section },
      { header: "Line", value: (r) => r.name },
      { header: "Amount", value: (r) => r.amount },
    ], [
      ...(balanceSheet.assets || []).map((row) => ({ section: "Assets", ...row })),
      { section: "Assets", name: "Total assets", amount: balanceSheet.total_assets },
      ...(balanceSheet.liabilities || []).map((row) => ({ section: "Liabilities", ...row })),
      { section: "Liabilities", name: "Total liabilities", amount: balanceSheet.total_liabilities },
      { section: "Equity", name: "Net position", amount: balanceSheet.net_position },
    ]);
  }

  function exportActive() {
    if (active === "daily") return exportDaily();
    if (active === "trial") return exportTrialBalance();
    if (active === "profit-loss") return exportProfitLoss();
    if (active === "balance-sheet") return exportBalanceSheet();
    return exportStatement();
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Accounts & Ledger</h1>
          <p className="text-sm text-slate-500">Statements and transaction reports derived from ledger entries.</p>
        </div>
        <button className="btn-primary" onClick={exportActive}>
          <Download size={16} /> Export CSV
        </button>
      </header>

      <Alert message={error} />

      <div className="flex flex-wrap gap-2">
        {REPORTS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={active === key ? "btn-primary" : "btn-ghost"}
            onClick={() => setActive(key)}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-4">
          {active === "customer" && (
            <Field label="Customer">
              <select className="input" value={selectedCustomer} onChange={(e) => setSelectedCustomer(e.target.value)}>
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
            </Field>
          )}
          {active === "supplier" && (
            <Field label="Supplier">
              <select className="input" value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)}>
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
            </Field>
          )}
          {active === "daily" ? (
            <Field label="Day">
              <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </Field>
          ) : active === "trial" || active === "balance-sheet" ? (
            <Field label="As of">
              <input className="input" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            </Field>
          ) : (
            <>
              <Field label="From">
                <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="To">
                <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
              {LEDGER_REPORTS.includes(active) && (
                <div className="flex items-end">
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    Balance: <span className="font-semibold text-slate-800">{money(statement.balance)}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : active === "daily" ? (
        <DailyTable rows={groupedDaily} />
      ) : active === "trial" ? (
        <TrialBalanceTable data={trialBalance} />
      ) : active === "profit-loss" ? (
        <ProfitLossTable data={profitLoss} />
      ) : active === "balance-sheet" ? (
        <BalanceSheetTable data={balanceSheet} />
      ) : (
        <EntryTable rows={statement.entries || []} />
      )}
    </div>
  );
}
