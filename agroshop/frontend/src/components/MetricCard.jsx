export default function MetricCard({ label, value, hint, tone = "neutral", icon: Icon }) {
  const tones = {
    neutral: "text-slate-800",
    good: "text-brand-700",
    warn: "text-amber-600",
    bad: "text-rose-600",
  };
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {Icon && <Icon size={16} className="shrink-0 text-slate-400" />}
      </div>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
