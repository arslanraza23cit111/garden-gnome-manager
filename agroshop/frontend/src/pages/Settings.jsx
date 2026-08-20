import { useEffect, useState } from "react";
import { HardDriveDownload, ShieldAlert } from "lucide-react";
import { api } from "../api/client.js";
import { Field, Alert } from "../components/Modal.jsx";

const PATH_KEY = "agroshop_backup_folder";
const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

export default function Settings() {
  const [folder, setFolder] = useState(() => localStorage.getItem(PATH_KEY) || "");
  const [last, setLast] = useState(null);
  const [autoLast, setAutoLast] = useState(null);
  const [autoStatus, setAutoStatus] = useState(null);
  const [autoError, setAutoError] = useState("");
  const [thermalPrinterName, setThermalPrinterName] = useState("");
  const [printerBusy, setPrinterBusy] = useState(false);
  const [printerError, setPrinterError] = useState("");
  const [printerSuccess, setPrinterSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    try {
      const [backup, printer] = await Promise.all([
        api.get("/settings/backup/last"),
        api.get("/settings/thermal-printer"),
      ]);
      if (backup) {
        setLast(backup.lastBackupAt || null);
        setAutoLast(backup.lastAutoBackupAt || null);
        setAutoStatus(backup.lastAutoBackupStatus || null);
        setAutoError(backup.lastAutoBackupError || "");
      }
      setThermalPrinterName(printer?.printerName || "");
    } catch (e) {
      setError(e.message);
    }
  };

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

  async function saveThermalPrinter() {
    setPrinterError("");
    setPrinterSuccess("");
    setPrinterBusy(true);
    try {
      const res = await api.put("/settings/thermal-printer", { printerName: thermalPrinterName });
      setThermalPrinterName(res.printerName);
      setPrinterSuccess("Thermal printer name saved.");
    } catch (e) {
      setPrinterError(e.message);
    } finally {
      setPrinterBusy(false);
    }
  }

  const lastDate = last ? new Date(last) : null;
  const autoLastDate = autoLast ? new Date(autoLast) : null;
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
          <div className="mt-3 text-sm">
            {autoLastDate ? (
              <>
                Last automatic backup: <strong>{autoLastDate.toLocaleString()}</strong>
                {autoStatus === "failure" ? (
                  <span className="ml-1 text-rose-700">— failed</span>
                ) : (
                  <span className="ml-1 text-slate-500">— success</span>
                )}
              </>
            ) : (
              <>
                <strong>No automatic backup has run yet.</strong>
                <div className="mt-0.5 text-xs text-slate-500">
                  A scheduled backup will run when a backup folder is configured.
                </div>
              </>
            )}
          </div>
          {autoStatus === "failure" && autoError && (
            <div className="mt-1 text-xs text-rose-700">Automatic backup failed: {autoError}</div>
          )}
        </div>
      </div>

      <div className="card space-y-4 p-5">
        <Field
          label="Thermal printer name"
          hint="Must exactly match the printer's name in Windows Settings > Printers & scanners."
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="input"
              value={thermalPrinterName}
              onChange={(e) => setThermalPrinterName(e.target.value)}
              placeholder="POS-80"
            />
            <button className="btn btn-secondary shrink-0" onClick={saveThermalPrinter} disabled={printerBusy}>
              {printerBusy ? "Saving..." : "Save"}
            </button>
          </div>
        </Field>

        <Alert message={printerError} tone="error" />
        <Alert message={printerSuccess} tone="success" />

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
