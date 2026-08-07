import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sprout, WifiOff, Leaf, ShieldCheck } from "lucide-react";
import { api, setSession } from "../api/client.js";
import { Alert } from "../components/Modal.jsx";


export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Public branding comes from the backend so shopIdentity.js stays the single source of truth.
  const [shop, setShop] = useState(null);

  useEffect(() => {
    api.get("/shop-identity").then(setShop).catch(() => setShop(null));
  }, []);

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
    <div className="min-h-screen bg-slate-100 lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <aside className="relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900 px-8 py-10 text-brand-50 lg:px-12 lg:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-brand-400/15 blur-3xl"
        />
        <div className="relative">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50/15 ring-1 ring-brand-50/25">
            <Sprout size={24} />
          </span>
          <h1 className="mt-8 text-3xl font-semibold leading-tight tracking-tight lg:text-4xl">{shop?.name || "\u00a0"}</h1>
          <p className="mt-3 max-w-sm text-sm text-brand-100/90">{shop?.tagline || "\u00a0"}</p>
          <p className="mt-8 max-w-xs text-xs leading-relaxed text-brand-100/70">
            {shop?.address}
            {shop?.address && <br />}
            {shop?.phone}
          </p>
        </div>
        <ul className="relative mt-10 space-y-3 text-xs text-brand-100/85">
          <li className="flex items-center gap-2">
            <Leaf size={14} /> Batch-wise stock, expiry &amp; profit tracking
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck size={14} /> Customer &amp; supplier ledgers, always balanced
          </li>
          <li className="flex items-center gap-2">
            <WifiOff size={14} /> Runs fully offline on this computer
          </li>
        </ul>
      </aside>

      {/* Form panel */}
      <main className="grid place-items-center px-6 py-12 lg:px-10">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use your shop account to open the management system.</p>

          <form onSubmit={submit} className="card mt-6 space-y-5 p-6">
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
            <button
              className="btn-primary w-full py-2.5 shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              disabled={busy}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <p className="text-center text-xs text-slate-400">Demo login: admin / admin123</p>
          </form>
        </div>
      </main>
    </div>
  );
}
