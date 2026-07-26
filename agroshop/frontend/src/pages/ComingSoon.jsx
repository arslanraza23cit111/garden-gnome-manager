import { Construction } from "lucide-react";

export default function ComingSoon({ title, phase, detail }) {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-slate-200 text-slate-500">
        <Construction size={22} />
      </span>
      <h1 className="text-lg font-semibold text-slate-800">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">Planned for Phase {phase}.</p>
      <p className="mt-4 text-sm text-slate-600">{detail}</p>
      <p className="mt-6 text-xs text-slate-400">
        The database tables for this module already exist, so no migration is needed later.
      </p>
    </div>
  );
}
