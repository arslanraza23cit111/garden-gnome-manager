import { useEffect, useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { api, money } from "../api/client.js";
import DataTable from "../components/DataTable.jsx";
import Modal, { Alert, Field } from "../components/Modal.jsx";

const EMPTY = { name: "", company: "", contact: "", address: "", opening_balance: "" };

export default function Suppliers() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState("");
  const [ledger, setLedger] = useState(null);

  const load = () => api.get("/suppliers").then(setRows).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function save() {
    setFormError("");
    if (!form.name.trim()) return setFormError("Supplier name is required");
    try {
      if (editing === "new") await api.post("/suppliers", form);
      else await api.put(`/suppliers/${editing}`, form);
      setEditing(null);
      load();
    } catch (e) {
      setFormError(e.message);
    }
  }

  const columns = [
    {
      key: "name",
      header: "Supplier",
      render: (r) => (
        <div>
          <p className="font-medium text-slate-800">{r.name}</p>
          <p className="text-xs text-slate-500">{r.company}</p>
        </div>
      ),
    },
    { key: "contact", header: "Contact" },
    { key: "address", header: "Address" },
    {
      key: "payable",
      header: "Payable",
      align: "right",
      render: (r) =>
        r.payable > 0 ? (
          <span className="font-medium tabular-nums text-rose-600">{money(r.payable)}</span>
        ) : r.payable < 0 ? (
          <span className="tabular-nums text-brand-700">advance {money(-r.payable)}</span>
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
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => api.get(`/suppliers/${r.id}/ledger`).then(setLedger)}>
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
          <h1 className="text-xl font-semibold text-slate-800">Suppliers</h1>
          <p className="text-sm text-slate-500">Payables come from purchase and payment ledger entries.</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            setForm(EMPTY);
            setEditing("new");
            setFormError("");
          }}
        >
          <Plus size={16} /> New supplier
        </button>
      </header>

      <Alert message={error} />

      <DataTable columns={columns} rows={rows} searchKeys={["name", "company", "contact"]} empty="No suppliers yet." />

      <Modal
        open={editing !== null}
        title={editing === "new" ? "New supplier" : "Edit supplier"}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save}>
              Save supplier
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
            <Field label="Company">
              <input className="input" value={form.company ?? ""} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </Field>
            <Field label="Contact">
              <input className="input" value={form.contact ?? ""} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            </Field>
            <Field label="Address">
              <input className="input" value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            {editing === "new" && (
              <Field label="Opening payable" hint="Amount already owed to this supplier.">
                <input className="input" type="number" step="0.01" value={form.opening_balance ?? ""} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} />
              </Field>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={!!ledger}
        wide
        title={ledger ? `${ledger.supplier.name} — ledger` : ""}
        subtitle={ledger ? `Payable: ${money(ledger.payable)}` : ""}
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
                  <td className="text-right font-medium tabular-nums">{money(-e.balance)}</td>
                </tr>
              ))}
              {!ledger?.entries.length && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No transactions yet for this supplier.
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
