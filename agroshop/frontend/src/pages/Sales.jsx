import { useEffect, useState } from "react";
import { Plus, Printer, Trash2 } from "lucide-react";
import { api, getUser, money, qty, todayStr } from "../api/client.js";
import DataTable from "../components/DataTable.jsx";
import Modal, { Alert, Field } from "../components/Modal.jsx";
import InvoicePrint from "../components/InvoicePrint.jsx";
import { canWrite } from "../lib/roles.js";

const emptyLine = () => ({ product_id: "", product_unit_id: "", quantity: "", rate: "", discount: "" });

export default function Sales() {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [invoice, setInvoice] = useState(null);
  // Search query state for customer and product typeahead inputs
  const [customerQuery, setCustomerQuery] = useState("");
  const [productQueries, setProductQueries] = useState({});
  const canEdit = canWrite(getUser()?.role, "sales");

  const load = () =>
    Promise.all([api.get("/sales"), api.get("/products"), api.get("/customers")])
      .then(async ([s, p, c]) => {
        const withUnits = await Promise.all(
          p.map(async (product) => ({
            ...product,
            units: await api.get(`/products/${product.id}/units`).catch(() => []),
          })),
        );
        setRows(s);
        setProducts(withUnits);
        setCustomers(c);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  async function openNew() {
    const { invoice_number } = await api.get("/sales/next-invoice");
    setForm({
      customer_id: "",
      invoice_number,
      date: todayStr(),
      payment_method: "cash",
      paid_amount: "",
      notes: "",
      items: [emptyLine()],
      // transport details (optional)
      transport_method: "vehicle",
      vehicle_number: "",
      driver_name: "",
      driver_cnic: "",
      transport_notes: "",
    });
    setFormError("");
    setOpen(true);
  }

  const stockOf = (id) => products.find((p) => String(p.id) === String(id))?.current_stock ?? 0;
  const productOf = (id) => products.find((p) => String(p.id) === String(id));
  const activeUnitsOf = (id) => (productOf(id)?.units ?? []).filter((u) => u.is_active !== 0);
  const unitOf = (line) => activeUnitsOf(line.product_id).find((u) => String(u.id) === String(line.product_unit_id));
  const baseQty = (line) => Number(line.quantity || 0) * Number(unitOf(line)?.conversion_factor || 0);
  const baseEquivalent = (line) => {
    if (!line.product_unit_id) return "";
    return `= ${qty(baseQty(line))} ${productOf(line.product_id)?.unit || "base units"}`;
  };
  const lineTotal = (l) => Number(l.quantity || 0) * Number(l.rate || 0) - Number(l.discount || 0);
  const total = form ? form.items.reduce((s, l) => s + lineTotal(l), 0) : 0;
  const remaining = total - Number(form?.paid_amount || 0);

  const setLine = (i, patch) =>
    setForm((f) => ({ ...f, items: f.items.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));

  async function save(thenPrint) {
    setFormError("");
    if (!form.customer_id) return setFormError("Choose a customer");
    for (const [i, l] of form.items.entries()) {
      if (!l.product_id) return setFormError(`Line ${i + 1}: choose a product`);
      if (!l.product_unit_id) return setFormError(`Line ${i + 1}: choose a unit`);
      if (!(Number(l.quantity) > 0)) return setFormError(`Line ${i + 1}: quantity must be more than zero`);
      if (baseQty(l) > stockOf(l.product_id))
        return setFormError(
          `Line ${i + 1}: only ${stockOf(l.product_id)} in stock — you cannot sell more than available`,
        );
      if (Number(l.rate) < 0) return setFormError(`Line ${i + 1}: rate cannot be negative`);
    }
    if (Number(form.paid_amount || 0) > total)
      return setFormError("Paid amount cannot be more than the invoice total");

    setSaving(true);
    try {
      const res = await api.post("/sales", {
        ...form,
        paid_amount: Number(form.paid_amount || 0),
        items: form.items.map((l) => ({ ...l, quantity_in_unit: Number(l.quantity || 0) })),
      });
      setOpen(false);
      await load();
      if (thenPrint) api.get(`/sales/${res.id}`).then(setInvoice);
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    { key: "invoice_number", header: "Invoice" },
    { key: "date", header: "Date" },
    { key: "customer_name", header: "Customer" },
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
    {
      key: "actions",
      header: "",
      sortable: false,
      align: "right",
      render: (r) => (
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => api.get(`/sales/${r.id}`).then(setInvoice)}>
          <Printer size={13} /> Invoice
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Sales</h1>
          <p className="text-sm text-slate-500">
            Stock leaves the nearest-expiry batch first; the customer ledger updates in the same transaction.
          </p>
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={openNew}>
            <Plus size={16} /> New sale
          </button>
        )}
      </header>

      <Alert message={error} />

      <DataTable
        columns={columns}
        rows={rows}
        searchKeys={["invoice_number", "customer_name", "date"]}
        empty="No sales recorded yet."
      />

      <Modal
        open={open}
        wide
        title="New sale"
        subtitle="Cannot exceed available stock or the customer's credit limit."
        onClose={() => setOpen(false)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-ghost" onClick={() => save(true)} disabled={saving}>
              Save &amp; print
            </button>
            <button className="btn-primary" onClick={() => save(false)} disabled={saving}>
              {saving ? "Saving…" : "Save sale"}
            </button>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            <Alert message={formError} />
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Customer" required>
                <div className="relative">
                  <input
                    className="input"
                    placeholder="Type to search customers…"
                    value={
                      customerQuery || (customers.find((c) => String(c.id) === String(form.customer_id))?.name ?? "")
                    }
                    onChange={(e) => {
                      setCustomerQuery(e.target.value);
                      setForm({ ...form, customer_id: "" });
                    }}
                    onBlur={() => setTimeout(() => setCustomerQuery(""), 150)}
                  />
                  {customerQuery && (
                    <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded border bg-white shadow">
                      <li className="px-2 py-1 text-xs text-slate-500">Matches</li>
                      {customers
                        .filter((c) =>
                          (`${c.name} ${c.mobile ?? ""}`).toLowerCase().includes(customerQuery.toLowerCase()),
                        )
                        .map((c) => (
                          <li
                            key={c.id}
                            className="cursor-pointer px-2 py-1 hover:bg-slate-100"
                            onMouseDown={() => {
                              setForm({ ...form, customer_id: c.id });
                              setCustomerQuery("");
                            }}
                          >
                            <div className="font-medium">{c.name}</div>
                            <div className="text-xs text-slate-500">{[c.mobile, c.area].filter(Boolean).join(" — ")}</div>
                          </li>
                        ))}
                      {customers.filter((c) => (`${c.name} ${c.mobile ?? ""}`).toLowerCase().includes(customerQuery.toLowerCase())).length === 0 && (
                        <li className="px-2 py-1 text-xs text-slate-500">No matches</li>
                      )}
                    </ul>
                  )}
                </div>
              </Field>
              <Field label="Invoice no." required>
                <input className="input" value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} />
              </Field>
              <Field label="Date" required>
                <input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </Field>
              <Field label="Payment method">
                <select className="input" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                  {['cash', 'bank', 'cheque', 'online', 'credit'].map((m) => (
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
                    <th className="text-right">In stock</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Rate</th>
                    <th className="text-right">Disc</th>
                    <th className="text-right">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((l, i) => {
                    const available = stockOf(l.product_id);
                    const over = baseQty(l) > available;
                    return (
                      <tr key={i}>
                        <td className="min-w-[200px]">
                          <div className="relative">
                            <input
                              className="input"
                              placeholder="Type product name…"
                              value={productQueries[i] ?? (products.find((p) => String(p.id) === String(l.product_id))?.name ?? "")}
                              onChange={(e) => {
                                const q = e.target.value;
                                setProductQueries((s) => ({ ...s, [i]: q }));
                                // clear product selection until user picks
                                setLine(i, { product_id: "", product_unit_id: "", rate: "" });
                              }}
                              onBlur={() => setTimeout(() => setProductQueries((s) => ({ ...s, [i]: "" })), 150)}
                            />

                            {(productQueries[i] ?? "") !== "" && (
                              <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded border bg-white shadow">
                                {products
                                  .filter((p) => (p.name || "").toLowerCase().includes((productQueries[i] ?? "").toLowerCase()))
                                  .map((p) => (
                                    <li
                                      key={p.id}
                                      className="cursor-pointer px-2 py-1 hover:bg-slate-100"
                                      onMouseDown={() => {
                                        const units = (p?.units ?? []).filter((u) => u.is_active !== 0);
                                        const defaultUnit = units.find((u) => u.is_default) ?? units[0];
                                        setLine(i, {
                                          product_id: p.id,
                                          product_unit_id: defaultUnit?.id ?? "",
                                          rate: l.rate || defaultUnit?.sale_price || p?.sale_price || "",
                                        });
                                        setProductQueries((s) => ({ ...s, [i]: "" }));
                                      }}
                                    >
                                      <div className="font-medium">{p.name}</div>
                                      <div className="text-xs text-slate-500">{p.packing_size ?? ""}</div>
                                    </li>
                                  ))}
                                {products.filter((p) => (p.name || "").toLowerCase().includes((productQueries[i] ?? "").toLowerCase())).length === 0 && (
                                  <li className="px-2 py-1 text-xs text-slate-500">No matches</li>
                                )}
                              </ul>
                            )}
                          </div>
                        </td>
                        <td className="w-36">
                          <select
                            className="input"
                            value={l.product_unit_id}
                            disabled={!l.product_id}
                            onChange={(e) => {
                              const unit = activeUnitsOf(l.product_id).find((u) => String(u.id) === e.target.value);
                              setLine(i, { product_unit_id: e.target.value, rate: unit?.sale_price || l.rate });
                            }}
                          >
                            <option value="">Select...</option>
                            {activeUnitsOf(l.product_id).map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.unit_label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="text-right tabular-nums text-slate-500">{qty(available)}</td>
                        <td className="w-28">
                          <input
                            className={`input text-right ${over ? "border-rose-400" : ""}`}
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
                        {['rate', 'discount'].map((k) => (
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
                    );
                  })}
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
              <Field label="Received now" hint="Leave 0 for a full-credit sale">
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
                  <span>Goes on credit</span>
                  <span className="tabular-nums">{money(remaining)}</span>
                </div>
              </div>
              
              {/* Transport details (optional) */}
              <div className="sm:col-span-3">
                <details className="rounded border bg-white p-3">
                  <summary className="cursor-pointer font-semibold">Transport details (optional)</summary>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-4">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name="transport_method"
                          checked={form.transport_method === "vehicle"}
                          onChange={() => setForm({ ...form, transport_method: "vehicle" })}
                        />
                        Vehicle
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name="transport_method"
                          checked={form.transport_method === "other"}
                          onChange={() => setForm({ ...form, transport_method: "other" })}
                        />
                        Other / Self-pickup
                      </label>
                    </div>

                    {form.transport_method === "vehicle" ? (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="Vehicle number">
                          <input className="input" value={form.vehicle_number} onChange={(e) => setForm({ ...form, vehicle_number: e.target.value })} />
                        </Field>
                        <Field label="Driver name">
                          <input className="input" value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} />
                        </Field>
                        <Field label="Driver CNIC">
                          <input className="input" value={form.driver_cnic} onChange={(e) => setForm({ ...form, driver_cnic: e.target.value })} />
                        </Field>
                      </div>
                    ) : (
                      <div>
                        <Field label="Transport notes">
                          <input className="input" value={form.transport_notes} onChange={(e) => setForm({ ...form, transport_notes: e.target.value })} />
                        </Field>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!invoice} wide title="Invoice" onClose={() => setInvoice(null)}>
        {invoice && <InvoicePrint sale={invoice} shop={invoice.shop} mode={invoice.shop?.print_mode || "a4"} />}
      </Modal>
    </div>
  );
}
