import { useEffect, useState } from "react";
import { Plus, Wallet } from "lucide-react";
import { api, money, todayStr } from "../api/client.js";
import DataTable from "../components/DataTable.jsx";
import Modal, { Alert, Field } from "../components/Modal.jsx";

const CATEGORIES = ["salary", "electricity", "rent", "transport", "fuel", "loading/unloading", "repair", "mobile/internet", "miscellaneous"];

export default function Expenses() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ category: "", from: "", to: "" });

  const load = () => api.get("/expenses").then(setRows).catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setForm({ category: CATEGORIES[0], amount: "", date: todayStr(), method: "cash", description: "" });
    setFormError("");
    setOpen(true);
  }

  async function save() {
    setFormError("");
    if (!(Number(form.amount || 0) > 0)) return setFormError("Amount must be greater than zero");
    setSaving(true);
    try {
      await api.post("/expenses", { ...form, amount: Number(form.amount || 0) });
      setOpen(false);
      load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const filtered = rows.filter((row) => (filters.category ? row.category === filters.category : true) && (filters.from ? row.date >= filters.from : true) && (filters.to ? row.date <= filters.to : true));
  const total = filtered.reduce((s, row) => s + Number(row.amount || 0), 0);

  const columns = [
    { key: "date", header: "Date" },
    { key: "category", header: "Category" },
    { key: "description", header: "Description" },
    { key: "amount", header: "Amount", align: "right", render: (r) => money(r.amount) },
    { key: "method", header: "Method", render: (r) => <span className="capitalize">{r.method}</span> },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Expenses</h1>
          <p className="text-sm text-slate-500">Post cash or bank expenses and track them by category.</p>
        </div>
        <button className="btn-primary" onClick={openNew}>
          <Plus size={16} /> New expense
        </button>
      </header>

      <Alert message={error} />
      <div className="card p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Category">
            <select className="input" value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
              <option value="">All</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="From">
            <input className="input" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          </Field>
          <Field label="To">
            <input className="input" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          </Field>
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex items-center justify-between font-semibold text-slate-700">
              <span>Total</span>
              <span className="tabular-nums">{money(total)}</span>
            </div>
          </div>
        </div>
      </div>

      <DataTable columns={columns} rows={filtered} searchKeys={["category", "description"]} empty="No expenses yet." />

      <Modal open={open} title="New expense" subtitle="Expenses reduce cash or bank and do not touch customer or supplier balances." onClose={() => setOpen(false)} footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save expense"}</button></>}>
        {form && (
          <div className="space-y-4">
            <Alert message={formError} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category" required>
                <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Date" required>
                <input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </Field>
              <Field label="Amount" required>
                <input className="input" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </Field>
              <Field label="Paid by" required>
                <select className="input" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                </select>
              </Field>
              <Field label="Description">
                <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
