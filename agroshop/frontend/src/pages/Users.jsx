import { useEffect, useState } from "react";
import { Power, UserPlus } from "lucide-react";
import { api, getUser } from "../api/client.js";
import DataTable from "../components/DataTable.jsx";
import Modal, { Alert, Field } from "../components/Modal.jsx";
import { ROLES } from "../lib/roles.js";

const EMPTY = { username: "", password: "", full_name: "", role: "salesman" };

export default function Users() {
  const current = getUser();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = () => api.get("/users").then(setRows).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function save() {
    setFormError("");
    if (!form.username.trim()) return setFormError("Username is required");
    if (form.password.length < 4) return setFormError("Password must be at least 4 characters");
    setSaving(true);
    try {
      await api.post("/users", form);
      setOpen(false);
      setForm(EMPTY);
      load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function assignRole(user, role) {
    try {
      await api.put(`/users/${user.id}`, { full_name: user.full_name, role });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function deactivate(user) {
    try {
      await api.patch(`/users/${user.id}/deactivate`);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  const columns = [
    {
      key: "username",
      header: "User",
      render: (r) => (
        <div>
          <p className="font-medium text-slate-800">{r.full_name || r.username}</p>
          <p className="text-xs text-slate-500">{r.username}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (r) => (
        <select
          className="input max-w-44 capitalize"
          value={r.role}
          disabled={!r.is_active}
          onChange={(e) => assignRole(r, e.target.value)}
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "is_active",
      header: "Status",
      render: (r) =>
        r.is_active ? (
          <span className="badge bg-brand-50 text-brand-700">Active</span>
        ) : (
          <span className="badge bg-slate-100 text-slate-500">Inactive</span>
        ),
    },
    { key: "created_at", header: "Created" },
    {
      key: "actions",
      header: "",
      sortable: false,
      align: "right",
      render: (r) =>
        r.is_active && r.id !== current?.id ? (
          <button className="btn-ghost px-2 py-1 text-xs text-rose-600" onClick={() => deactivate(r)}>
            <Power size={13} /> Deactivate
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Users</h1>
          <p className="text-sm text-slate-500">Create users, assign roles, and deactivate access without deleting history.</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            setForm(EMPTY);
            setFormError("");
            setOpen(true);
          }}
        >
          <UserPlus size={16} /> New user
        </button>
      </header>

      <Alert message={error} />
      <DataTable columns={columns} rows={rows} searchKeys={["username", "full_name", "role"]} empty="No users yet." />

      <Modal
        open={open}
        title="New user"
        subtitle="The user can change their password after signing in."
        onClose={() => setOpen(false)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Create user"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert message={formError} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Username" required>
              <input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </Field>
            <Field label="Full name">
              <input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </Field>
            <Field label="Password" required>
              <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="Role" required>
              <select className="input capitalize" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}
