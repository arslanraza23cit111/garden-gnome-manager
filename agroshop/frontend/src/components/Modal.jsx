import { X } from "lucide-react";

export default function Modal({ open, title, subtitle, onClose, children, footer, wide }) {
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8">
      <div className={`card w-full ${wide ? "max-w-5xl" : "max-w-xl"} overflow-hidden`}>
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button className="rounded-md p-1 text-slate-400 hover:bg-slate-100" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, required }) {
  return (
    <div>
      <label className="label">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

export function Alert({ message, tone = "error" }) {
  if (!message) return null;
  const tones = {
    error: "border-rose-200 bg-rose-50 text-rose-700",
    success: "border-brand-200 bg-brand-50 text-brand-700",
    info: "border-slate-200 bg-slate-50 text-slate-600",
  };
  return <div className={`rounded-lg border px-3 py-2 text-sm ${tones[tone]}`}>{message}</div>;
}
