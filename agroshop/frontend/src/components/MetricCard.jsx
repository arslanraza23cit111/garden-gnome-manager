export default function MetricCard({ label, value, hint, tone = "neutral", icon: Icon }) {
  const tones = {
    neutral: "text-slate-900",
    good: "text-brand-700",
    warn: "text-amber-600",
    bad: "text-rose-600",
  };
  const iconTones = {
    neutral: "bg-slate-100 text-slate-500",
    good: "bg-brand-50 text-brand-600",
    warn: "bg-amber-50 text-amber-600",
    bad: "bg-rose-50 text-rose-600",
  };
  return (
    <div className="group card relative overflow-hidden p-5 transition duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md">
      <span
        className={`absolute inset-x-0 top-0 h-0.5 opacity-0 transition group-hover:opacity-100 ${
          tone === "bad" ? "bg-rose-400" : tone === "warn" ? "bg-amber-400" : "bg-brand-500"
        }`}
      />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
        {Icon && (
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${iconTones[tone]}`}>
            <Icon size={16} />
          </span>
        )}
      </div>
      <p className={`mt-3 text-[28px] font-semibold leading-none tracking-tight tabular-nums ${tones[tone]}`}>
        {value}
      </p>
      {hint && <p className="mt-2 text-xs leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}
