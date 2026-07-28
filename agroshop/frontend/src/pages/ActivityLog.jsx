import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Filter, RotateCcw } from "lucide-react";
import { api } from "../api/client.js";
import { Alert, Field } from "../components/Modal.jsx";

const PAGE_SIZE = 25;

const EMPTY_FILTERS = {
  user_id: "",
  action: "",
  table_name: "",
  from: "",
  to: "",
};

function formatUser(row) {
  if (row.full_name || row.username) return row.full_name ? `${row.full_name} (${row.username})` : row.username;
  return row.user_id ? `User #${row.user_id}` : "System";
}

function formatWhen(value) {
  if (!value) return "-";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function ActivityLog() {
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [filters, offset]);

  useEffect(() => {
    api.get("/users").then(setUsers).catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    api
      .get(`/activity-log?${query}`)
      .then((data) => {
        setRows(data.rows || []);
        setTotal(data.total || 0);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [query]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
    setOffset(0);
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setOffset(0);
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Activity log</h1>
          <p className="text-sm text-slate-500">Review who changed records and when.</p>
        </div>
      </header>

      <Alert message={error} />

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Field label="User">
            <select className="input" value={filters.user_id} onChange={(e) => updateFilter("user_id", e.target.value)}>
              <option value="">All users</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.full_name || user.username}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Action">
            <input className="input" value={filters.action} onChange={(e) => updateFilter("action", e.target.value)} placeholder="create" />
          </Field>
          <Field label="Table">
            <input className="input" value={filters.table_name} onChange={(e) => updateFilter("table_name", e.target.value)} placeholder="sales" />
          </Field>
          <Field label="From">
            <input className="input" type="date" value={filters.from} onChange={(e) => updateFilter("from", e.target.value)} />
          </Field>
          <Field label="To">
            <input className="input" type="date" value={filters.to} onChange={(e) => updateFilter("to", e.target.value)} />
          </Field>
          <div className="flex items-end gap-2">
            <button className="btn-ghost w-full justify-center" onClick={resetFilters}>
              <RotateCcw size={15} /> Reset
            </button>
          </div>
        </div>
      </section>

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Who</th>
              <th>Action</th>
              <th>Record</th>
              <th>Details</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{formatUser(row)}</td>
                <td>
                  <span className="badge bg-brand-50 text-brand-700">{row.action}</span>
                </td>
                <td>
                  <span className="font-medium text-slate-700">{row.table_name || "-"}</span>
                  {row.record_id ? <span className="text-slate-500"> #{row.record_id}</span> : null}
                </td>
                <td>{row.details || "-"}</td>
                <td>{formatWhen(row.timestamp)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-sm text-slate-500">
                  {loading ? "Loading activity..." : "No activity found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
        <span>
          <Filter size={14} className="mr-1 inline" />
          {total} record{total === 1 ? "" : "s"} &middot; page {Math.min(page, pages)} of {pages}
        </span>
        <div className="flex gap-2">
          <button className="btn-ghost px-2" disabled={offset <= 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
            <ChevronLeft size={16} />
          </button>
          <button className="btn-ghost px-2" disabled={offset + PAGE_SIZE >= total || loading} onClick={() => setOffset(offset + PAGE_SIZE)}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
