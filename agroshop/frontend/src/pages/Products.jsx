import { useEffect, useMemo, useState } from "react";
import { Layers, Plus, Trash2 } from "lucide-react";
import { api, getUser, money, qty } from "../api/client.js";
import DataTable from "../components/DataTable.jsx";
import Modal, { Alert, Field } from "../components/Modal.jsx";
import { canWrite } from "../lib/roles.js";

const UNITS = ["kg", "bag", "litre", "bottle", "packet", "piece"];
const emptySellingUnit = (patch = {}) => ({
  id: null,
  unit_label: "",
  conversion_factor: "",
  sale_price: "",
  is_default: false,
  ...patch,
});

const EMPTY = {
  name: "",
  company: "",
  category: "Fertilizer",
  type: "",
  unit: "bag",
  packing_size: "",
  purchase_price: "",
  sale_price: "",
  retail_price: "",
  wholesale_price: "",
  min_stock_level: "",
  selling_units: [emptySellingUnit({ is_default: true })],
};

export default function Products() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState("");
  const [batchesFor, setBatchesFor] = useState(null);
  const canEdit = canWrite(getUser()?.role, "products");

  const load = () => api.get("/products").then(setRows).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setForm(EMPTY);
    setEditing("new");
    setFormError("");
  };
  const openEdit = async (p) => {
    const units = await api.get(`/products/${p.id}/units`).catch(() => []);
    setForm({
      ...EMPTY,
      ...p,
      selling_units: units.length
        ? units.map((u) => ({ ...u, is_default: Boolean(u.is_default), is_active: u.is_active !== 0 }))
        : [emptySellingUnit({ unit_label: p.unit, conversion_factor: 1, sale_price: p.sale_price, is_default: true })],
    });
    setEditing(p.id);
    setFormError("");
  };

  const setUnit = (idx, patch) =>
    setForm((f) => ({
      ...f,
      selling_units: f.selling_units.map((u, i) =>
        i === idx
          ? { ...u, ...patch, ...(patch.is_default ? { is_default: true } : {}) }
          : patch.is_default
            ? { ...u, is_default: false }
            : u,
      ),
    }));

  const removeUnit = async (idx) => {
    const unit = form.selling_units[idx];
    if (unit.id && editing !== "new") {
      await api.delete(`/products/${editing}/units/${unit.id}`);
    }
    setForm((f) => {
      const next = f.selling_units.filter((_, i) => i !== idx);
      if (next.length && !next.some((u) => u.is_default)) next[0] = { ...next[0], is_default: true };
      return { ...f, selling_units: next };
    });
  };

  async function saveUnits(productId) {
    const units = form.selling_units
      .filter((u) => u.is_active !== false)
      .filter((u) => String(u.unit_label || "").trim());
    for (const [i, u] of units.entries()) {
      if (!(Number(u.conversion_factor) > 0)) throw new Error(`Unit ${i + 1}: conversion factor must be more than zero`);
      if (Number(u.sale_price) < 0) throw new Error(`Unit ${i + 1}: price cannot be negative`);
      if (!u.id) {
        await api.post(`/products/${productId}/units`, {
          unit_label: u.unit_label,
          conversion_factor: Number(u.conversion_factor),
          sale_price: Number(u.sale_price || 0),
          is_default: Boolean(u.is_default),
        });
      }
    }
  }

  async function save() {
    setFormError("");
    if (!form.name.trim()) return setFormError("Product name is required");
    if (!form.unit) return setFormError("Unit is required");
    if (Number(form.sale_price) < 0 || Number(form.purchase_price) < 0)
      return setFormError("Prices cannot be negative");
    if (!form.selling_units.some((u) => String(u.unit_label || "").trim()))
      return setFormError("Add at least one selling unit");
    try {
      if (editing === "new") {
        const created = await api.post("/products", form);
        await saveUnits(created.id);
      } else {
        await api.put(`/products/${editing}`, form);
        await saveUnits(editing);
      }
      setEditing(null);
      load();
    } catch (e) {
      setFormError(e.message);
    }
  }

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: "Product",
        render: (r) => (
          <div>
            <p className="font-medium text-slate-800">{r.name}</p>
            <p className="text-xs text-slate-500">
              {[r.company, r.packing_size].filter(Boolean).join(" · ")}
            </p>
          </div>
        ),
      },
      { key: "category", header: "Category" },
      { key: "type", header: "Type" },
      {
        key: "current_stock",
        header: "Stock",
        align: "right",
        render: (r) => (
          <span
            className={`tabular-nums ${
              r.current_stock <= r.min_stock_level ? "font-semibold text-amber-600" : ""
            }`}
          >
            {qty(r.current_stock)} {r.unit}
          </span>
        ),
      },
      { key: "min_stock_level", header: "Min", align: "right", render: (r) => qty(r.min_stock_level) },
      { key: "purchase_price", header: "Purchase", align: "right", render: (r) => money(r.purchase_price) },
      { key: "sale_price", header: "Sale", align: "right", render: (r) => money(r.sale_price) },
      { key: "stock_value", header: "Stock value", align: "right", render: (r) => money(r.stock_value) },
      {
        key: "actions",
        header: "",
        sortable: false,
        align: "right",
        render: (r) => (
          <div className="flex justify-end gap-1.5">
            <button
              className="btn-ghost px-2 py-1 text-xs"
              onClick={() => api.get(`/products/${r.id}`).then(setBatchesFor)}
            >
              <Layers size={13} /> Batches
            </button>
            {canEdit && (
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => openEdit(r)}>
                Edit
              </button>
            )}
          </div>
        ),
      },
    ],
    [canEdit],
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Products &amp; Inventory</h1>
          <p className="text-sm text-slate-500">
            Stock is tracked per batch and expiry — it changes only through purchases, sales and returns.
          </p>
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={openNew}>
            <Plus size={16} /> New product
          </button>
        )}
      </header>

      <Alert message={error} />

      <DataTable
        columns={columns}
        rows={rows}
        searchKeys={["name", "company", "category", "type"]}
        empty="No products yet — add your first product."
      />

      <Modal
        open={editing !== null}
        title={editing === "new" ? "New product" : "Edit product"}
        subtitle="Current stock is not editable here by design."
        onClose={() => setEditing(null)}
        wide
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save}>
              Save product
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
            <Field label="Company / brand">
              <input className="input" value={form.company ?? ""} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </Field>
            <Field label="Category">
              <select className="input" value={form.category ?? ""} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {["Fertilizer", "Pesticide", "Micronutrient", "Seed", "Other"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Type" hint="e.g. Granular, Insecticide, Fungicide">
              <input className="input" value={form.type ?? ""} onChange={(e) => setForm({ ...form, type: e.target.value })} />
            </Field>
            <Field label="Unit" required>
              <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                {UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </Field>
            <Field label="Packing size" hint="e.g. 50 kg, 250 ml">
              <input className="input" value={form.packing_size ?? ""} onChange={(e) => setForm({ ...form, packing_size: e.target.value })} />
            </Field>
            {[
              ["purchase_price", "Purchase price"],
              ["sale_price", "Sale price"],
              ["retail_price", "Retail price"],
              ["wholesale_price", "Wholesale price"],
              ["min_stock_level", "Minimum stock level"],
            ].map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form[key] ?? ""}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-700">Selling units</h3>
              <button
                className="btn-ghost px-2 py-1 text-xs"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    selling_units: [
                      ...f.selling_units,
                      emptySellingUnit({ sale_price: f.sale_price || "", is_default: !f.selling_units.length }),
                    ],
                  }))
                }
              >
                <Plus size={14} /> Add unit
              </button>
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th className="text-right">Base factor</th>
                    <th className="text-right">Price</th>
                    <th className="text-center">Default</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {form.selling_units.map((u, idx) => (
                    <tr key={u.id ?? idx}>
                      <td>
                        <input
                          className="input"
                          value={u.unit_label ?? ""}
                          placeholder="50kg bag"
                          disabled={!!u.id}
                          onChange={(e) => setUnit(idx, { unit_label: e.target.value })}
                        />
                      </td>
                      <td className="w-32">
                        <input
                          className="input text-right"
                          type="number"
                          min="1"
                          step="1"
                          value={u.conversion_factor ?? ""}
                          disabled={!!u.id}
                          onChange={(e) => setUnit(idx, { conversion_factor: e.target.value })}
                        />
                      </td>
                      <td className="w-32">
                        <input
                          className="input text-right"
                          type="number"
                          min="0"
                          step="0.01"
                          value={u.sale_price ?? ""}
                          disabled={!!u.id}
                          onChange={(e) => setUnit(idx, { sale_price: e.target.value })}
                        />
                      </td>
                      <td className="text-center">
                        <input
                          type="checkbox"
                          checked={Boolean(u.is_default)}
                          disabled={!!u.id}
                          onChange={(e) => setUnit(idx, { is_default: e.target.checked })}
                        />
                      </td>
                      <td className="w-10 text-right">
                        <button
                          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          onClick={() => removeUnit(idx)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!form.selling_units.length && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-500">
                        Add at least one selling unit.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!batchesFor}
        title={batchesFor ? `${batchesFor.name} — batches` : ""}
        subtitle="Every low-stock or expiry alert points at one of these rows."
        onClose={() => setBatchesFor(null)}
        wide
      >
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Batch</th>
                <th>Expiry</th>
                <th className="text-right">Quantity</th>
                <th className="text-right">Cost rate</th>
                <th className="text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {batchesFor?.batches?.map((b) => (
                <tr key={b.id}>
                  <td>{b.batch_number}</td>
                  <td>{b.expiry_date || "—"}</td>
                  <td className="text-right tabular-nums">{qty(b.quantity)}</td>
                  <td className="text-right tabular-nums">{money(b.purchase_rate)}</td>
                  <td className="text-right tabular-nums">{money(b.quantity * b.purchase_rate)}</td>
                </tr>
              ))}
              {!batchesFor?.batches?.length && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No stock yet — record a purchase for this product.
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
