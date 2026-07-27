import { useEffect, useState } from "react";
import { Plus, UserMinus, UserCheck, Wallet } from "lucide-react";
import { api, money, todayStr } from "../api/client.js";
import DataTable from "../components/DataTable.jsx";
import Modal, { Alert, Field } from "../components/Modal.jsx";

export default function Employees() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [payFor, setPayFor] = useState(null);
  const [payForm, setPayForm] = useState(null);
  const [payError, setPayError] = useState("");
  const [paying, setPaying] = useState(false);

  const [expanded, setExpanded] = useState(null);
  const [history, setHistory] = useState([]);

  const load = () => api.get("/employees").then(setRows).catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  function loadHistory(id) {
    if (expanded === id) {
      setExpanded(null);
      setHistory([]);
      return;
    }
    setExpanded(id);
    api.get(`/employees/${id}/payments`).then(setHistory).catch((e) => setError(e.message));
  }

  function openNew() {
    setForm({ name: "", mobile: "", salary: "", joining_date: todayStr(), role: "" });
    setFormError("");
  }

  function openEdit(row) {
    setForm({ id: row.id, name: row.name, mobile: row.mobile ?? "", salary: row.salary, joining_date: row.joining_date ?? todayStr(), role: row.role ?? "" });
    setFormError("");
  }

  async function save() {
    setFormError("");
    if (!form.name.trim()) return setFormError("Name is required");
    setSaving(true);
    try {
      const payload = { ...form, salary: Number(form.salary || 0) };
      if (form.id) await api.put(`/employees/${form.id}`, payload);
      else await api.post("/employees", payload);
      setForm(null);
      load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(row) {
    setError("");
    try {
      await api.post(`/employees/${row.id}/${row.is_active ? "deactivate" : "reactivate"}`, {});
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  function openPay(row) {
    setPayFor(row);
    setPayForm({ amount: row.salary || "", date: todayStr(), method: "cash", notes: "" });
    setPayError("");
  }

  async function paySalary() {
    setPayError("");
    if (!(Number(payForm.amount || 0) > 0)) return setPayError("Amount must be greater than zero");
    setPaying(true);
    try {
      await api.post(`/employees/${payFor.id}/salary-payments`, { ...payForm, amount: Number(payForm.amount) });
      setNotice(`Salary paid to ${payFor.name}.`);
      const id = payFor.id;
      setPayFor(null);
      load();
      if (expanded === id) api.get(`/employees/${id}/payments`).then(setHistory);
    } catch (e) {
      setPayError(e.message);
    } finally {
      setPaying(false);
    }
  }

  const columns = [
    { key: "name", header: "Name" },
    { key: "role", header: "Role" },
    { key: "mobile", header: "Mobile" },
    { key: "salary", header: "Monthly salary", align: "right", render: (r) => money(r.salary) },
    { key: "total_paid", header: "Total paid", align: "right", render: (r) => money(r.total_paid) },
    { key: "last_paid_on", header: "Last paid", render: (r) => r.last_paid_on || "—" },
    {
      key: "is_active",
      header: "Status",
      render: (r) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {r.is_active ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <div className="flex flex-wrap justify-end gap-2">
          {r.is_active === 1 && (
            <button className="btn-ghost" onClick={() => openPay(r)}>
              <Wallet size={14} /> Pay salary
            </button>
          )}
          <button className="btn-ghost" onClick={() => openEdit(r)}>Edit</button>
          <button className="btn-ghost" onClick={() => loadHistory(r.id)}>
            {expanded === r.id ? "Hide history" : "History"}
          </button>
          <button className="btn-ghost" onClick={() => deactivate(r)}>
            {r.is_active ? <><UserMinus size={14} /> Deactivate</> : <><UserCheck size={14} /> Reactivate</>}
          </button>
        </div>
      ),
    },
  ];

  const expandedEmployee = rows.find((r) => r.id === expanded);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Employees</h1>
          <p className="text-sm text-slate-500">Staff records and salary payments. Salary payments post as “salary” expenses and reduce cash or bank.</p>
        </div>
        <button className="btn-primary" onClick={openNew}>
          <Plus size={16} /> New employee
        </button>
      </header>

      <Alert message={error} />
      {notice && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}

      <DataTable columns={columns} rows={rows} searchKeys={["name", "role", "mobile"]} empty="No employees yet." />

      {expandedEmployee && (
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Salary payments — {expandedEmployee.name}</h2>
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">No salary payments recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="py-1.5">Date</th>
                  <th className="py-1.5">Method</th>
                  <th className="py-1.5">Notes</th>
                  <th className="py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="py-1.5">{p.date}</td>
                    <td className="py-1.5 capitalize">{p.method}</td>
                    <td className="py-1.5 text-slate-500">{p.notes || "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <Modal
        open={!!form}
        title={form?.id ? "Edit employee" : "New employee"}
        onClose={() => setForm(null)}
        footer={<><button className="btn-ghost" onClick={() => setForm(null)}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button></>}
      >
        {form && (
          <div className="space-y-4">
            <Alert message={formError} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" required>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Mobile">
                <input className="input" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
              </Field>
              <Field label="Monthly salary">
                <input className="input" type="number" min="0" step="0.01" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} />
              </Field>
              <Field label="Joining date">
                <input className="input" type="date" value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} />
              </Field>
              <Field label="Role">
                <input className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
              </Field>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!payFor}
        title={`Pay salary — ${payFor?.name ?? ""}`}
        subtitle="Recorded as a salary expense; reduces cash or bank."
        onClose={() => setPayFor(null)}
        footer={<><button className="btn-ghost" onClick={() => setPayFor(null)}>Cancel</button><button className="btn-primary" onClick={paySalary} disabled={paying}>{paying ? "Saving…" : "Pay salary"}</button></>}
      >
        {payForm && (
          <div className="space-y-4">
            <Alert message={payError} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Amount" required>
                <input className="input" type="number" min="0" step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
              </Field>
              <Field label="Date" required>
                <input className="input" type="date" value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} />
              </Field>
              <Field label="Paid by" required>
                <select className="input" value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                </select>
              </Field>
              <Field label="Notes">
                <input className="input" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} />
              </Field>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
