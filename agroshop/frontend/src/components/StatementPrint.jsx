import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { money } from "../api/client.js";

export default function StatementPrint({
  partyType,
  party,
  statement,
  from,
  to,
  shop,
  onBack,
  autoPrint = true,
}) {
  useEffect(() => {
    document.body.classList.add("printing-statement");
    return () => document.body.classList.remove("printing-statement");
  }, []);

  useEffect(() => {
    if (!autoPrint) return undefined;
    const timer = window.setTimeout(() => window.print(), 100);
    return () => window.clearTimeout(timer);
  }, [autoPrint]);

  const shopName = shop?.shop_name || "MADINA TRADERS";
  const shopAddress = shop?.shop_address || "MADINA TRADERS NAWAN JANDAWALA SARGHODHA ROAD";
  const shopPhone = shop?.shop_phone || "0308-7616000";
  const shopEmail = shop?.shop_email || "rajputali78678690@gmail.com";
  const partyLabel = partyType === "supplier" ? "Supplier" : "Customer";
  const partyName = party?.name || `Selected ${partyLabel.toLowerCase()}`;
  const fromLabel = from || "start";
  const toLabel = to || "today";
  const entries = statement?.entries || [];
  const balance = Number(statement?.balance || 0);
  const balanceText =
    balance >= 0 ? `Balance due: Rs ${money(balance)}` : `Balance in credit: Rs ${money(Math.abs(balance))}`;
  const statementContent = (
    <div className="mx-auto max-w-[190mm] bg-white p-6 text-[13px] text-slate-800">
      <div className="flex items-start justify-between border-b-2 border-slate-800 pb-3">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wide">{shopName}</h1>
          <p className="text-xs text-slate-600">{shop?.shop_tagline}</p>
          <p className="text-xs text-slate-600">{shopAddress}</p>
          <p className="text-xs text-slate-600">Phone: {shopPhone}</p>
          <p className="text-xs text-slate-600">Email: {shopEmail}</p>
        </div>
        <div className="text-right text-xs">
          <p className="text-base font-semibold">{partyLabel.toUpperCase()} STATEMENT</p>
          <p>
            {partyLabel}: <strong>{partyName}</strong>
          </p>
          <p>
            Period: {fromLabel} to {toLabel}
          </p>
        </div>
      </div>

      <div className="mt-4 text-sm">
        <p className="font-semibold">
          Statement for {partyName}, {fromLabel} to {toLabel}
        </p>
      </div>

      <table className="mt-4 w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-300 px-2 py-1.5 text-left">Date</th>
            <th className="border border-slate-300 px-2 py-1.5 text-left">Description</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Debit</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Credit</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Running Balance</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((row) => (
            <tr key={row.id}>
              <td className="border border-slate-300 px-2 py-1.5">{row.date}</td>
              <td className="border border-slate-300 px-2 py-1.5">{row.description || "-"}</td>
              <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums">
                {row.debit ? money(row.debit) : "-"}
              </td>
              <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums">
                {row.credit ? money(row.credit) : "-"}
              </td>
              <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums">
                {row.balance === undefined ? "-" : money(row.balance)}
              </td>
            </tr>
          ))}
          {!entries.length && (
            <tr>
              <td colSpan={5} className="border border-slate-300 px-2 py-8 text-center text-slate-500">
                No ledger entries found.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-5 flex justify-end">
        <div className="border-t-2 border-slate-800 px-2 pt-2 text-right text-base font-bold">
          {balanceText}
        </div>
      </div>

      <div className="mt-10 flex justify-between text-xs text-slate-500">
        <p>This statement is generated from ledger entries for the selected period.</p>
        <p className="border-t border-slate-400 pt-1">Authorised signature</p>
      </div>
    </div>
  );

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <button className="btn-ghost" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <button className="btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> Print
        </button>
      </div>

      {statementContent}
      {createPortal(
        <div className="statement-print-portal" aria-hidden="true">
          {statementContent}
        </div>,
        document.body
      )}
    </div>
  );
}
