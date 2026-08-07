import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Banknote,
  CalendarClock,
  Landmark,
  PackageSearch,
  Receipt,
  ShoppingCart,
  TrendingUp,
  TriangleAlert,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";
import { api, money } from "../api/client.js";
import MetricCard from "../components/MetricCard.jsx";
import { Alert } from "../components/Modal.jsx";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/dashboard").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert message={error} />;
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-7xl space-y-10">
      {data.show_backup_banner && (
        <Alert
          tone="info"
          message={
            "Automatic backups are disabled until a backup folder is set in Settings. " +
            "Please configure a backup path to enable nightly database backups."
          }
        />
      )}
      <header className="border-b border-slate-200 pb-5">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Shop position for {data.date}</p>
      </header>

      <section className="space-y-4">
        <h2 className="section-title">Today’s activity</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard label="Today's sale" value={money(data.today_sale)} icon={Receipt} tone="good"
            hint={`Cash ${money(data.today_cash_sale)} · Credit ${money(data.today_credit_sale)}`} />
          <MetricCard label="Today's purchase" value={money(data.today_purchase)} icon={ShoppingCart} />
          <MetricCard label="Today's profit (est.)" value={money(data.today_profit)} icon={TrendingUp} tone="good" />
          <MetricCard label="Today's expenses" value={money(data.today_expense)} icon={Wallet} />
          <MetricCard label="Received today" value={money(data.today_receipts)} icon={Banknote} />
          <MetricCard label="Paid today" value={money(data.today_payments)} icon={Banknote} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="section-title">Balances &amp; position</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard label="Cash in hand" value={money(data.cash_in_hand)} icon={Wallet}
            tone={data.cash_in_hand < 0 ? "bad" : "neutral"} />
          <MetricCard label="Bank balance" value={money(data.bank_balance)} icon={Landmark}
            tone={data.bank_balance < 0 ? "bad" : "neutral"} />
          <MetricCard label="Customer outstanding" value={money(data.customer_outstanding)} icon={Users} tone="warn"
            hint="Money farmers/dealers owe the shop" />
          <MetricCard label="Supplier payable" value={money(data.supplier_payable)} icon={ShoppingCart} tone="bad"
            hint="Money the shop owes suppliers" />
          <MetricCard label="Stock value" value={money(data.stock_value)} icon={Warehouse}
            hint="At purchase cost, batch-wise" />
          <MetricCard label="This month" value={money(data.month_sale)} icon={TrendingUp}
            hint={`Profit ${money(data.month_profit)}`} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="section-title">Needs attention</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card overflow-hidden border-amber-200 bg-amber-50/40">
            <div className="flex items-center gap-2 border-b border-amber-200/70 bg-amber-50 px-5 py-3">
              <TriangleAlert size={16} className="text-amber-600" />
              <h3 className="text-sm font-semibold text-amber-900">Low stock</h3>
              <span className="badge bg-amber-200/70 text-amber-900">{data.low_stock_count}</span>
              <Link to="/products" className="ml-auto text-xs font-medium text-brand-700 hover:underline">
                Products
              </Link>
            </div>
            <div className="px-5 py-1">
              {data.low_stock.length ? (
                <ul className="divide-y divide-amber-200/60 text-sm">
                  {data.low_stock.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="text-slate-700">
                        {p.name}
                        <span className="ml-1 text-xs text-slate-500">{p.company}</span>
                      </span>
                      <span className="shrink-0 tabular-nums font-medium text-amber-700">
                        {p.current_stock} / {p.min_stock_level} {p.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-5 text-sm text-slate-600">All products are above their minimum level.</p>
              )}
            </div>
          </div>

          <div className="card overflow-hidden border-rose-200 bg-rose-50/40">
            <div className="flex items-center gap-2 border-b border-rose-200/70 bg-rose-50 px-5 py-3">
              <CalendarClock size={16} className="text-rose-600" />
              <h3 className="text-sm font-semibold text-rose-900">Near expiry</h3>
              <span className="badge bg-rose-200/70 text-rose-900">{data.near_expiry_count}</span>
            </div>
            <div className="px-5 py-1">
              {data.near_expiry.length ? (
                <ul className="divide-y divide-rose-200/60 text-sm">
                  {data.near_expiry.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="text-slate-700">
                        {b.product_name}
                        <span className="ml-1 text-xs text-slate-500">batch {b.batch_number}</span>
                      </span>
                      <span className="shrink-0 tabular-nums font-medium text-rose-700">
                        {b.expiry_date} · {b.quantity} {b.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-5 text-sm text-slate-600">No batch expires within 90 days.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="section-title">Recent activity</h2>
        <div className="card p-5">
          <h3 className="panel-title mb-2">
            <PackageSearch size={16} className="text-slate-400" /> Recent sales
            <Link to="/sales" className="ml-auto text-xs font-medium text-brand-700 hover:underline">
              All sales
            </Link>
          </h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {data.recent_sales.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2.5">
                <span className="text-slate-600">
                  <span className="font-medium text-slate-800">{s.invoice_number}</span> · {s.customer_name}
                </span>
                <span className="tabular-nums font-medium text-slate-800">{money(s.total_amount)}</span>
              </li>
            ))}
            {!data.recent_sales.length && <li className="py-4 text-slate-500">No sales recorded yet.</li>}
          </ul>
        </div>
      </section>
    </div>
  );
}

