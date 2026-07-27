import { useEffect, useState } from "react";
import { Plus, RotateCcw } from "lucide-react";
import { api, money, qty, todayStr } from "../api/client.js";
import DataTable from "../components/DataTable.jsx";
import Modal, { Alert, Field } from "../components/Modal.jsx";

export default function SaleReturns() {
  const [rows, setRows] = useState([]);
  const [sales, setSales] = useState([]);
  const [detail, setDetail] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () =>
    Promise.all([api.get("/sale-returns"), api.get("/sales")])
      .then(([r, s]) => {
        setRows(r);
        setSales(s);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  async function openNew() {
    setForm({ sale_id: "", date: todayStr(), reason: "", items: [] });
    setFormError("");
    setOpen(true);
  }

  async function selectSale(id) {
    if (!id) {
      setDetail(null);
      setForm((f) => ({ ...f, sale_id: "", items: [] }));
      return;
    }
    const sale = await api.get(`/sales/${id}`);
    setDetail(sale);
    setForm((f) => ({ ...f, sale_id: id, items: sale.items.map((it) => ({ sale_item_id: it.id, quantity: "" })) }));
  }

  async function save() {
    setFormError("");
    if (!form.sale_id) return setFormError("Choose a sale");
    const items = form.items.filter((it) => Number(it.quantity || 0) > 0);
    if (!items.length) return setFormError("Enter at least one return quantity");
    for (const it of items) {
      const line = detail.items.find((row) => String(row.id) === String(it.sale_item_id));
      if (!line) return setFormError("One of the selected items is invalid");
      if (Number(it.quantity) > line.quantity)
        return setFormError(`Return quantity cannot exceed the sold quantity for ${line.product_name}`);
    }
    setSaving(true);
    try {
      await api.post("/sale-returns", { ...form, items: items.map((it) => ({ sale_item_id: it.sale_item_id, quantity: Number(it.quantity) })) });
      setOpen(false);
      load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    { key: "id", header: "ID" },
    { key: "date", header: "Date" },
    { key: "invoice_number", header: "Sale" },
    { key: "customer_name", header: "Customer" },
    { key: "total_amount", header: "Amount", align: "right", render: (r) => money(r.total_amount) },
    { key: "reason", header: "Reason" },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Sale returns</h1>
          <p className="text-sm text-slate-500">Restock goods and reduce customer outstanding.</p>
        </div>
        <button className="btn-primary" onClick={openNew}>
          <RotateCcw size={16} /> New return
        </button>
      </header>

      <Alert message={error} />
      <DataTable columns={columns} rows={rows} searchKeys={["invoice_number", "customer_name", "reason"]} empty="No sale returns yet." />

      <Modal open={open} wide title="Sale return" subtitle="Choose the sale and the quantities to reverse." onClose={() => setOpen(false)} footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save return"}</button></>}>
        {form && (
          <div className="space-y-4">
            <Alert message={formError} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Sale" required>
                <select className="input" value={form.sale_id} onChange={(e) => selectSale(e.target.value)}>
                  <option value="">Select…</option>
                  {sales.map((s) => (
                    <option key={s.id} value={s.id}>{s.invoice_number} · {s.customer_name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Date" required>
                <input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </Field>
            </div>
            <Field label="Reason">
              <input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </Field>
            {detail && (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="text-right">Sold</th>
                      <th className="text-right">Return qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((it) => (
                      <tr key={it.id}>
                        <td>{it.product_name}</td>
                        <td className="text-right tabular-nums">{qty(it.quantity)} {it.unit}</td>
                        <td className="w-32">
                          <input className="input text-right" type="number" min="0" step="0.01" value={form.items.find((row) => String(row.sale_item_id) === String(it.id))?.quantity || ""} onChange={(e) => setForm((f) => ({ ...f, items: f.items.map((row) => String(row.sale_item_id) === String(it.id) ? { ...row, quantity: e.target.value } : row) }))} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
