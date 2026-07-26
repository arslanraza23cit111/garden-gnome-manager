import { useEffect, useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { api, money } from "../api/client.js";
import DataTable from "../components/DataTable.jsx";
import Modal, { Alert, Field } from "../components/Modal.jsx";

const EMPTY = {
  name: "",
  father_name: "",
  cnic: "",
  mobile: "",
  address: "",
  area: "",
  customer_type: "farmer",
  credit_limit: "",
  opening_balance: "",
};

export default function Customers() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState("");
  const [ledger, setLedger] = useState(null);

  const load = () => api.get("/customers").then(setRows).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function save() {
    setFormError("");
    if (!form.name.trim()) return setFormError("Customer name is required");
    if (Number(form.credit_limit || 0) < 0) return setFormError("Credit limit cannot be negative");
    try {
      if (editing === "new") await api.post("/customers", form);
      else await api.put(`/customers/${editing}`, form);
      setEditing(null);
      load();
    } catch (e) {
      setFormError(e.message);
    }
  }

  const columns = [
    {
      key: "name",
      header: "Customer",
      render: (r) => (
        <div>
          <p className="font-medium text-slate-800">{r.name}</p>
          <p className="text-xs text-slate-500">
            {[r.father_name && `s/o ${r.father_name}`, r.area].filter(Boolean).join(" · ")}
          </p>
        </div>
      ),
    },
    { key: "mobile", header: "Mobile" },
    { key: "customer_type", header: "Type", render: (r) => <span className="capitalize">{r.customer_type}</span> },
    { key: "credit_limit", header: "Credit limit", align: "right", render: (r) => money(r.credit_limit) },
    {
      key: "balance",
      header: "Outstanding",
      align: "right",
      render: (r) =>
        r.balance > 0 ? (
          <span className="font-medium tabular-nums text-amber-600">{money(r.balance)}</span>
        ) : r.balance < 0 ? (
          <span className="tabular-nums text-brand-700">advance {money(-r.balance)}</span>
        ) : (
          <span className="text-slate-400">clear</span>
        ),
    },
    {
      key: "actions",
      header: "",
      sortable: false,
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-1.5">
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => api.get(`/customers/${r.id}/ledger`).then(setLedger)}>
            <BookOpen size={13} /> Ledger
          </button>
          <button
            className="btn-ghost px-2 py-1 text-xs"
            onClick={() => {
              setForm({ ...EMPTY, ...r });
              setEditing(r.id);
              setFormError("");
            }}
          >
            Edit
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Customers</h1>
          <p className="text-sm text-slate-500">Balances are computed from the ledger — never typed in.</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            setForm(EMPTY);
            setEditing("new");
            setFormError("");
          }}
        >
          <Plus size={16} /> New customer
        </button>
      </header>

      <Alert message={error} />

      <DataTable columns={columns} rows={rows} searchKeys={["name", "mobile", "area", "father_name"]} empty="No customers yet." />

      <Modal
        open={editing !== null}
        title={editing === "new" ? "New customer" : "Edit customer"}
        onClose={() => setEditing(null)}
        wide
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save}>
              Save customer
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert message={formError} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Father name">
              <input className="input" value={form.father_name ?? ""} onChange={(e) => setForm({ ...form, father_name: e.target.value })} />
            </Field>
            <Field label="CNIC" hint="Optional">
              <input className="input" value={form.cnic ?? ""} onChange={(e) => setForm({ ...form, cnic: e.target.value })} />
            </Field>
            <Field label="Mobile">
              <input className="input" value={form.mobile ?? ""} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            </Field>
            <Field label="Address">
              <input className="input" value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            <Field label="Area / village">
              <input className="input" value={form.area ?? ""} onChange={(e) => setForm({ ...form, area: e.target.value })} />
            </Field>
            <Field label="Customer type">
              <select className="input" value={form.customer_type} onChange={(e) => setForm({ ...form, customer_type: e.target.value })}>
                {["farmer", "dealer", "walk-in"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Credit limit" hint="0 = no limit check">
              <input className="input" type="number" min="0" step="0.01" value={form.credit_limit ?? ""} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} />
            </Field>
            {editing === "new" && (
              <Field label="Opening balance" hint="Amount the customer already owes. Posted as a ledger entry.">
                <input className="input" type="number" step="0.01" value={form.opening_balance ?? ""} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} />
              </Field>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={!!ledger}
        wide
        title={ledger ? `${ledger.customer.name} — ledger` : ""}
        subtitle={ledger ? `Outstanding: ${money(ledger.balance)}` : ""}
        onClose={() => setLedger(null)}
      >
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Type</th>
                <th className="text-right">Debit</th>
                <th className="text-right">Credit</th>
                <th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledger?.entries.map((e) => (
                <tr key={e.id}>
                  <td>{e.date}</td>
                  <td>{e.description}</td>
                  <td className="capitalize">{e.source_type.replace("_", " ")}</td>
                  <td className="text-right tabular-nums">{e.debit ? money(e.debit) : "—"}</td>
                  <td className="text-right tabular-nums">{e.credit ? money(e.credit) : "—"}</td>
                  <td className="text-right font-medium tabular-nums">{money(e.balance)}</td>
                </tr>
              ))}
              {!ledger?.entries.length && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No transactions yet for this customer.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
}
