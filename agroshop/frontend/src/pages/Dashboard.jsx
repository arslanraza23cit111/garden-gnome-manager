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
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-500">Shop position for {data.date}</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Today's sale" value={money(data.today_sale)} icon={Receipt} tone="good"
          hint={`Cash ${money(data.today_cash_sale)} · Credit ${money(data.today_credit_sale)}`} />
        <MetricCard label="Today's purchase" value={money(data.today_purchase)} icon={ShoppingCart} />
        <MetricCard label="Today's profit (est.)" value={money(data.today_profit)} icon={TrendingUp} tone="good" />
        <MetricCard label="Today's expenses" value={money(data.today_expense)} icon={Wallet} />
        <MetricCard label="Received today" value={money(data.today_receipts)} icon={Banknote} />
        <MetricCard label="Paid today" value={money(data.today_payments)} icon={Banknote} />
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
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <TriangleAlert size={16} className="text-amber-500" /> Low stock ({data.low_stock_count})
            <Link to="/products" className="ml-auto text-xs font-normal text-brand-600 hover:underline">
              Products
            </Link>
          </h2>
          {data.low_stock.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.low_stock.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <span>
                    {p.name}
                    <span className="ml-1 text-xs text-slate-400">{p.company}</span>
                  </span>
                  <span className="tabular-nums text-amber-600">
                    {p.current_stock} / {p.min_stock_level} {p.unit}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-sm text-slate-500">All products are above their minimum level.</p>
          )}
        </div>

        <div className="card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <CalendarClock size={16} className="text-rose-500" /> Near expiry ({data.near_expiry_count})
          </h2>
          {data.near_expiry.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.near_expiry.map((b) => (
                <li key={b.id} className="flex items-center justify-between py-2">
                  <span>
                    {b.product_name}
                    <span className="ml-1 text-xs text-slate-400">batch {b.batch_number}</span>
                  </span>
                  <span className="tabular-nums text-rose-600">
                    {b.expiry_date} · {b.quantity} {b.unit}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-sm text-slate-500">No batch expires within 90 days.</p>
          )}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <PackageSearch size={16} className="text-slate-400" /> Recent sales
          <Link to="/sales" className="ml-auto text-xs font-normal text-brand-600 hover:underline">
            All sales
          </Link>
        </h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {data.recent_sales.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2">
              <span className="text-slate-600">
                <span className="font-medium text-slate-800">{s.invoice_number}</span> · {s.customer_name}
              </span>
              <span className="tabular-nums">
                {money(s.total_amount)}
              </span>
            </li>
          ))}
          {!data.recent_sales.length && <li className="py-4 text-slate-500">No sales recorded yet.</li>}
        </ul>
      </section>
    </div>
  );
}
