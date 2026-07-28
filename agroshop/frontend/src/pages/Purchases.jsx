import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api, getUser, money, qty, todayStr } from "../api/client.js";
import DataTable from "../components/DataTable.jsx";
import Modal, { Alert, Field } from "../components/Modal.jsx";
import { canWrite } from "../lib/roles.js";

const emptyLine = () => ({
  product_id: "",
  product_unit_id: "",
  batch_number: "",
  expiry_date: "",
  quantity: "",
  rate: "",
  discount: "",
  tax: "",
});

export default function Purchases() {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(null);
  const canEdit = canWrite(getUser()?.role, "purchases");

  const load = () =>
    Promise.all([api.get("/purchases"), api.get("/products"), api.get("/suppliers")])
      .then(async ([p, pr, s]) => {
        const withUnits = await Promise.all(
          pr.map(async (product) => ({
            ...product,
            units: await api.get(`/products/${product.id}/units`).catch(() => []),
          })),
        );
        setRows(p);
        setProducts(withUnits);
        setSuppliers(s);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  async function openNew() {
    const { invoice_number } = await api.get("/purchases/next-invoice");
    setForm({
      supplier_id: "",
      invoice_number,
      date: todayStr(),
      payment_method: "cash",
      paid_amount: "",
      notes: "",
      items: [emptyLine()],
    });
    setFormError("");
    setOpen(true);
  }

  const lineTotal = (l) =>
    Number(l.quantity || 0) * Number(l.rate || 0) - Number(l.discount || 0) + Number(l.tax || 0);
  const total = form ? form.items.reduce((s, l) => s + lineTotal(l), 0) : 0;
  const remaining = total - Number(form?.paid_amount || 0);
  const productOf = (id) => products.find((p) => String(p.id) === String(id));
  const activeUnitsOf = (id) => (productOf(id)?.units ?? []).filter((u) => u.is_active !== 0);
  const unitOf = (line) => activeUnitsOf(line.product_id).find((u) => String(u.id) === String(line.product_unit_id));
  const baseQty = (line) => Number(line.quantity || 0) * Number(unitOf(line)?.conversion_factor || 0);
  const baseEquivalent = (line) => {
    if (!line.product_unit_id) return "";
    return `= ${qty(baseQty(line))} ${productOf(line.product_id)?.unit || "base units"}`;
  };

  const setLine = (i, patch) =>
    setForm((f) => ({ ...f, items: f.items.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));

  async function save() {
    setFormError("");
    if (!form.supplier_id) return setFormError("Choose a supplier");
    if (!form.items.length) return setFormError("Add at least one product line");
    for (const [i, l] of form.items.entries()) {
      if (!l.product_id) return setFormError(`Line ${i + 1}: choose a product`);
      if (!l.product_unit_id) return setFormError(`Line ${i + 1}: choose a unit`);
      if (!(Number(l.quantity) > 0)) return setFormError(`Line ${i + 1}: quantity must be more than zero`);
      if (Number(l.rate) < 0) return setFormError(`Line ${i + 1}: rate cannot be negative`);
    }
    if (Number(form.paid_amount || 0) > total)
      return setFormError("Paid amount cannot be more than the invoice total");

    setSaving(true);
    try {
      await api.post("/purchases", {
        ...form,
        paid_amount: Number(form.paid_amount || 0),
        items: form.items.map((l) => ({ ...l, quantity_in_unit: Number(l.quantity || 0) })),
      });
      setOpen(false);
      load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    { key: "invoice_number", header: "Invoice" },
    { key: "date", header: "Date" },
    { key: "supplier_name", header: "Supplier" },
    { key: "total_amount", header: "Total", align: "right", render: (r) => money(r.total_amount) },
    { key: "paid_amount", header: "Paid", align: "right", render: (r) => money(r.paid_amount) },
    {
      key: "remaining_amount",
      header: "Balance",
      align: "right",
      render: (r) =>
        r.remaining_amount > 0 ? (
          <span className="badge bg-amber-50 text-amber-700">{money(r.remaining_amount)}</span>
        ) : (
          <span className="badge bg-brand-50 text-brand-700">Paid</span>
        ),
    },
    { key: "payment_method", header: "Method", render: (r) => <span className="capitalize">{r.payment_method}</span> },
    {
      key: "actions",
      header: "",
      sortable: false,
      align: "right",
      render: (r) => (
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => api.get(`/purchases/${r.id}`).then(setDetail)}>
          View
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Purchase entry</h1>
          <p className="text-sm text-slate-500">
            Saving a purchase increases batch stock and the supplier payable in one atomic step.
          </p>
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={openNew}>
            <Plus size={16} /> New purchase
          </button>
        )}
      </header>

      <Alert message={error} />

      <DataTable
        columns={columns}
        rows={rows}
        searchKeys={["invoice_number", "supplier_name", "date"]}
        empty="No purchases recorded yet."
      />

      <Modal
        open={open}
        wide
        title="New purchase"
        subtitle="Stock and the supplier ledger update automatically."
        onClose={() => setOpen(false)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save purchase"}
            </button>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            <Alert message={formError} />
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Supplier" required>
                <select
                  className="input"
                  value={form.supplier_id}
                  onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                >
                  <option value="">Select…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Invoice no." required>
                <input
                  className="input"
                  value={form.invoice_number}
                  onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                />
              </Field>
              <Field label="Date" required>
                <input
                  className="input"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </Field>
              <Field label="Payment method">
                <select
                  className="input"
                  value={form.payment_method}
                  onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                >
                  {["cash", "bank", "cheque", "online", "credit"].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Unit</th>
                    <th>Batch no.</th>
                    <th>Expiry</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Rate</th>
                    <th className="text-right">Disc</th>
                    <th className="text-right">Tax</th>
                    <th className="text-right">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((l, i) => (
                    <tr key={i}>
                      <td className="min-w-[180px]">
                        <select
                          className="input"
                          value={l.product_id}
                          onChange={(e) => {
                            const p = products.find((x) => String(x.id) === e.target.value);
                            const units = (p?.units ?? []).filter((u) => u.is_active !== 0);
                            const defaultUnit = units.find((u) => u.is_default) ?? units[0];
                            setLine(i, {
                              product_id: e.target.value,
                              product_unit_id: defaultUnit?.id ?? "",
                              rate: l.rate || p?.purchase_price || "",
                            });
                          }}
                        >
                          <option value="">Select…</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} {p.packing_size ? `(${p.packing_size})` : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="w-36">
                        <select
                          className="input"
                          value={l.product_unit_id}
                          onChange={(e) => setLine(i, { product_unit_id: e.target.value })}
                          disabled={!l.product_id}
                        >
                          <option value="">Select...</option>
                          {activeUnitsOf(l.product_id).map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.unit_label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="w-28">
                        <input className="input" value={l.batch_number} placeholder="-" onChange={(e) => setLine(i, { batch_number: e.target.value })} />
                      </td>
                      <td className="w-36">
                        <input className="input" type="date" value={l.expiry_date} onChange={(e) => setLine(i, { expiry_date: e.target.value })} />
                      </td>
                      <td className="w-28">
                        <input
                          className="input text-right"
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.quantity}
                          onChange={(e) => setLine(i, { quantity: e.target.value })}
                        />
                        {l.product_unit_id && (
                          <p className="mt-1 text-right text-[11px] text-slate-500">{baseEquivalent(l)}</p>
                        )}
                      </td>
                      {["rate", "discount", "tax"].map((k) => (
                        <td key={k} className="w-24">
                          <input
                            className="input text-right"
                            type="number"
                            min="0"
                            step="0.01"
                            value={l[k]}
                            onChange={(e) => setLine(i, { [k]: e.target.value })}
                          />
                        </td>
                      ))}
                      <td className="w-24 text-right tabular-nums">{money(lineTotal(l))}</td>
                      <td className="w-10">
                        <button
                          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button className="btn-ghost" onClick={() => setForm((f) => ({ ...f, items: [...f.items, emptyLine()] }))}>
              <Plus size={15} /> Add line
            </button>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Notes">
                <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>
              <Field label="Paid now">
                <input
                  className="input text-right"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.paid_amount}
                  onChange={(e) => setForm({ ...form, paid_amount: e.target.value })}
                />
              </Field>
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{money(total)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Remaining payable</span>
                  <span className="tabular-nums">{money(remaining)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!detail} wide title={detail ? `Purchase ${detail.invoice_number}` : ""} subtitle={detail?.supplier_name} onClose={() => setDetail(null)}>
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Batch</th>
                    <th>Expiry</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Rate</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.product_name}</td>
                      <td>{it.batch_number}</td>
                      <td>{it.expiry_date || "—"}</td>
                      <td className="text-right tabular-nums">{qty(it.quantity)} {it.unit}</td>
                      <td className="text-right tabular-nums">{money(it.rate)}</td>
                      <td className="text-right tabular-nums">{money(it.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ml-auto w-56 space-y-1">
              <div className="flex justify-between font-semibold"><span>Total</span><span>{money(detail.total_amount)}</span></div>
              <div className="flex justify-between"><span>Paid</span><span>{money(detail.paid_amount)}</span></div>
              <div className="flex justify-between"><span>Balance</span><span>{money(detail.remaining_amount)}</span></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
