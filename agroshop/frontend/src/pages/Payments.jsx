import { useEffect, useState } from "react";
import { Banknote, Plus } from "lucide-react";
import { api, money, todayStr } from "../api/client.js";
import DataTable from "../components/DataTable.jsx";
import Modal, { Alert, Field } from "../components/Modal.jsx";

export default function Payments() {
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () =>
    Promise.all([api.get("/payments"), api.get("/customers"), api.get("/suppliers")])
      .then(([p, c, s]) => {
        setRows(p);
        setCustomers(c);
        setSuppliers(s);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setForm({ direction: "in", party_type: "customer", party_id: "", amount: "", method: "cash", date: todayStr(), reference: "", notes: "", confirm_overpay: false });
    setFormError("");
    setOpen(true);
  }

  async function save() {
    setFormError("");
    if (!form.party_id) return setFormError("Choose a party");
    if (!(Number(form.amount || 0) > 0)) return setFormError("Amount must be greater than zero");
    setSaving(true);
    try {
      await api.post("/payments", { ...form, amount: Number(form.amount || 0) });
      setOpen(false);
      load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    { key: "date", header: "Date" },
    { key: "direction", header: "Direction", render: (r) => <span className="capitalize">{r.direction}</span> },
    { key: "party_type", header: "Party", render: (r) => <span className="capitalize">{r.party_type}</span> },
    { key: "reference", header: "Reference" },
    { key: "amount", header: "Amount", align: "right", render: (r) => money(r.amount) },
    { key: "method", header: "Method", render: (r) => <span className="capitalize">{r.method}</span> },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Payments & receipts</h1>
          <p className="text-sm text-slate-500">Book customer receipts and supplier payments without creating a new sale or purchase.</p>
        </div>
        <button className="btn-primary" onClick={openNew}>
          <Plus size={16} /> New entry
        </button>
      </header>

      <Alert message={error} />
      <DataTable columns={columns} rows={rows} searchKeys={["reference", "party_type", "method"]} empty="No payment entries yet." />

      <Modal open={open} title="Payments & receipts" subtitle="Posting goes straight to the ledger and cash/bank accounts." onClose={() => setOpen(false)} footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save entry"}</button></>}>
        {form && (
          <div className="space-y-4">
            <Alert message={formError} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Direction" required>
                <select className="input" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                  <option value="in">Receive payment</option>
                  <option value="out">Pay supplier</option>
                </select>
              </Field>
              <Field label="Party type" required>
                <select className="input" value={form.party_type} onChange={(e) => setForm({ ...form, party_type: e.target.value, party_id: "" })}>
                  <option value="customer">Customer</option>
                  <option value="supplier">Supplier</option>
                </select>
              </Field>
              <Field label="Party" required>
                <select className="input" value={form.party_id} onChange={(e) => setForm({ ...form, party_id: e.target.value })}>
                  <option value="">Select…</option>
                  {(form.party_type === "customer" ? customers : suppliers).map((party) => (
                    <option key={party.id} value={party.id}>{party.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Method" required>
                <select className="input" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                  {['cash','bank','cheque','online'].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Amount" required>
                <input className="input" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </Field>
              <Field label="Date" required>
                <input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </Field>
              <Field label="Reference">
                <input className="input" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
              </Field>
              <Field label="Notes">
                <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={form.confirm_overpay || false} onChange={(e) => setForm({ ...form, confirm_overpay: e.target.checked })} />
              I confirm this may overpay the party balance.
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
