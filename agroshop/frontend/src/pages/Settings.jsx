import { useEffect, useState } from "react";
import { HardDriveDownload, ShieldAlert } from "lucide-react";
import { api } from "../api/client.js";
import { Field, Alert } from "../components/Modal.jsx";

const PATH_KEY = "agroshop_backup_folder";
const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

export default function Settings() {
  const [folder, setFolder] = useState(() => localStorage.getItem(PATH_KEY) || "");
  const [last, setLast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = () =>
    api
      .get("/settings/backup/last")
      .then((r) => setLast(r?.lastBackupAt || null))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  async function backupNow() {
    setError("");
    setSuccess("");
    if (!folder.trim()) return setError("Enter a destination folder path first");
    setBusy(true);
    try {
      const res = await api.post("/settings/backup", { folder: folder.trim() });
      localStorage.setItem(PATH_KEY, folder.trim());
      setLast(res.timestamp);
      setSuccess(`Backup saved to ${res.destination}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const lastDate = last ? new Date(last) : null;
  const stale = !lastDate || Date.now() - lastDate.getTime() > THREE_DAYS;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Settings &amp; Backup</h1>
        <p className="text-sm text-slate-500">
          Copy the local database file to a USB drive or another folder on this PC.
        </p>
      </div>

      <div
        className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
          stale ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-600"
        }`}
      >
        {stale && <ShieldAlert size={18} className="mt-0.5 shrink-0" />}
        <div>
          {lastDate ? (
            <>
              Last backup: <strong>{lastDate.toLocaleString()}</strong>
              {stale && <div className="mt-0.5 text-xs">That is more than 3 days ago — take a fresh backup.</div>}
            </>
          ) : (
            <>
              <strong>No backup taken yet.</strong>
              <div className="mt-0.5 text-xs">Take one today so a PC failure cannot lose your records.</div>
            </>
          )}
        </div>
      </div>

      <div className="card space-y-4 p-5">
        <Field
          label="Backup destination folder"
          required
          hint="A folder path on this computer, e.g. D:\\AgroShopBackups or E:\\ (USB drive). It is created if missing."
        >
          <input
            className="input"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="D:\\AgroShopBackups"
          />
        </Field>

        <Alert message={error} tone="error" />
        <Alert message={success} tone="success" />

        <button className="btn btn-primary inline-flex items-center gap-2" onClick={backupNow} disabled={busy}>
          <HardDriveDownload size={16} />
          {busy ? "Backing up…" : "Backup now"}
        </button>
      </div>
    </div>
  );
}
