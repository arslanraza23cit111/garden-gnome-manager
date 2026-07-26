import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sprout, WifiOff } from "lucide-react";
import { api, setSession } from "../api/client.js";
import { Alert } from "../components/Modal.jsx";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.username.trim() || !form.password) return setError("Enter both username and password");
    setBusy(true);
    try {
      const res = await api.post("/auth/login", form);
      setSession(res.token, res.user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-white">
            <Sprout size={22} />
          </span>
          <h1 className="text-xl font-semibold text-slate-800">AgroShop</h1>
          <p className="text-sm text-slate-500">Fertilizer &amp; pesticides business management</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-5">
          <Alert message={error} />
          <div>
            <label className="label">Username</label>
            <input
              className="input"
              autoFocus
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-center text-xs text-slate-400">Demo login: admin / admin123</p>
        </form>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-500">
          <WifiOff size={13} /> Runs fully offline on this computer
        </p>
      </div>
    </div>
  );
}
