import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { money, qty } from "../api/client.js";

const PX_PER_MM = 96 / 25.4;
const THERMAL_HEIGHT_BUFFER_MM = 6;

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * Thermal receipt printing is done in a dedicated hidden iframe with its own
 * self-contained stylesheet. Printing the main document relied on @media print
 * rules toggling body classes, which produced an empty preview on some Windows
 * setups. The iframe carries only the receipt markup, so the preview can never
 * be blank, and the exact page height is measured inside the iframe (never
 * "auto", which makes thermal drivers feed roll paper endlessly).
 */
function buildThermalHtml({ sale, shopName, shopAddress, shopPhone, shopEmail, width }) {
  const paperWidth = width === 58 ? 58 : 80;
  const contentWidth = paperWidth - 4;
  const rows = (sale.items || [])
    .map(
      (it) => `
      <div class="item">
        <div>${esc(it.product_name)}${it.packing_size ? ` (${esc(it.packing_size)})` : ""}</div>
        <div class="row">
          <span>${esc(qty(it.quantity))} x ${esc(money(it.rate))}</span>
          <span>${esc(money(it.line_total))}</span>
        </div>
      </div>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(sale.invoice_number)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body {
    width: ${contentWidth}mm;
    font-family: ui-monospace, "Courier New", monospace;
    font-size: ${paperWidth === 58 ? 10 : 11}px;
    line-height: 1.35;
    padding: 1mm 0;
  }
  .center { text-align: center; }
  .shop { font-size: ${paperWidth === 58 ? 12 : 13}px; font-weight: 700; text-transform: uppercase; }
  .sep { border-top: 1px dashed #555; margin: 4px 0; }
  .row { display: flex; justify-content: space-between; gap: 4px; }
  .row.strong { font-weight: 700; }
  .item { margin-bottom: 3px; }
  @page { size: ${paperWidth}mm PAGE_HEIGHT; margin: 2mm; }
</style>
</head>
<body>
  <div class="center">
    <div class="shop">${esc(shopName)}</div>
    <div>${esc(shopAddress)}</div>
    <div>${esc(shopPhone)}</div>
    <div>${esc(shopEmail)}</div>
  </div>
  <div class="sep"></div>
  <div class="row"><span>${esc(sale.invoice_number)}</span><span>${esc(sale.date)}</span></div>
  <div>Customer: ${esc(sale.customer_name)}</div>
  <div class="sep"></div>
  ${rows}
  <div class="sep"></div>
  <div class="row strong"><span>Total</span><span>${esc(money(sale.total_amount))}</span></div>
  <div class="row"><span>Paid</span><span>${esc(money(sale.paid_amount))}</span></div>
  <div class="row strong"><span>Balance</span><span>${esc(money(sale.remaining_amount))}</span></div>
  <div class="sep"></div>
  <div class="center">Thank you &mdash; visit again</div>
</body>
</html>`;
}

function printThermal(data) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;left:-10000px;top:0;width:120mm;height:400mm;border:0;visibility:hidden;";
  document.body.appendChild(frame);

  const cleanup = () => {
    setTimeout(() => frame.remove(), 1000);
  };

  const doc = frame.contentDocument;
  doc.open();
  doc.write(buildThermalHtml(data));
  doc.close();

  const run = () => {
    // Measure the rendered receipt and pin an exact page height so the driver
    // stops feeding paper (never use "size: 80mm auto").
    const body = doc.body;
    const heightPx = Math.max(body.scrollHeight, body.getBoundingClientRect().height, 100);
    const heightMm = Math.ceil(heightPx / PX_PER_MM + THERMAL_HEIGHT_BUFFER_MM);
    const style = doc.querySelector("style");
    style.textContent = style.textContent.replace("PAGE_HEIGHT", `${heightMm}mm`);

    frame.contentWindow.focus();
    frame.contentWindow.print();
    cleanup();
  };

  if (doc.readyState === "complete") setTimeout(run, 50);
  else frame.onload = () => setTimeout(run, 50);
}

/**
 * One print action, two layouts:
 *  - A4 invoice (default) — prints the main document
 *  - thermal receipt (58mm / 80mm) — prints a dedicated iframe
 */
export default function InvoicePrint({ sale, shop, mode = "a4", width = 80 }) {
  const [printMode, setPrintMode] = useState(mode);
  const thermalRef = useRef(null);

  useEffect(() => {
    document.body.classList.add("printing-invoice");
    return () => document.body.classList.remove("printing-invoice");
  }, []);

  useEffect(() => {
    const styleId = "print-page-size";
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = "@media print { @page { size: A4; margin: 12mm; } }";
    return () => style.remove();
  }, []);

  if (!sale) return null;
  const shopName = shop?.shop_name || "MADINA TRADERS";
  const shopAddress = shop?.shop_address || "MADINA TRADERS NAWAN JANDAWALA SARGHODHA ROAD";
  const shopPhone = shop?.shop_phone || "0308-7616000";
  const shopEmail = shop?.shop_email || "rajputali78678690@gmail.com";

  const handlePrint = () => {
    if (printMode === "thermal") {
      printThermal({ sale, shopName, shopAddress, shopPhone, shopEmail, width });
    } else {
      window.print();
    }
  };

  const invoiceContent =
    printMode === "a4" ? (
      <A4 sale={sale} shop={shop} shopName={shopName} />
    ) : (
      <Thermal sale={sale} shopName={shopName} shop={shop} width={width} />
    );

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-slate-300">
          {["a4", "thermal"].map((m) => (
            <button
              key={m}
              onClick={() => setPrintMode(m)}
              className={`px-3 py-1.5 text-sm ${
                printMode === m ? "bg-brand-600 text-white" : "bg-white text-slate-600"
              }`}
            >
              {m === "a4" ? "A4 invoice" : "Thermal receipt"}
            </button>
          ))}
        </div>
        {printMode === "thermal" && (
          <select className="input w-28" value={width} onChange={() => {}} disabled>
            <option value={80}>80 mm</option>
          </select>
        )}
        <button className="btn-primary" onClick={handlePrint}>
          <Printer size={16} /> Print
        </button>
      </div>

      <div ref={thermalRef}>{invoiceContent}</div>
      {printMode === "a4" &&
        createPortal(
          <div className="invoice-print-portal" aria-hidden="true">
            {invoiceContent}
          </div>,
          document.body
        )}
    </div>
  );
}

function Totals({ sale }) {
  return (
    <>
      <Row label="Total" value={money(sale.total_amount)} strong />
      <Row label="Paid" value={money(sale.paid_amount)} />
      <Row label="Balance" value={money(sale.remaining_amount)} strong />
    </>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function A4({ sale, shop, shopName }) {
  const shopAddress = shop?.shop_address || "MADINA TRADERS NAWAN JANDAWALA SARGHODHA ROAD";
  const shopPhone = shop?.shop_phone || "0308-7616000";
  const shopEmail = shop?.shop_email || "rajputali78678690@gmail.com";
  return (
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
          <p className="text-base font-semibold">SALE INVOICE</p>
          <p>
            No: <strong>{sale.invoice_number}</strong>
          </p>
          <p>Date: {sale.date}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
        <div>
          <p className="font-semibold uppercase text-slate-500">Customer</p>
          <p className="text-sm font-medium">{sale.customer_name}</p>
          {sale.customer_mobile && <p>{sale.customer_mobile}</p>}
          {(sale.customer_address || sale.customer_area) && (
            <p>{[sale.customer_address, sale.customer_area].filter(Boolean).join(", ")}</p>
          )}
        </div>
        <div className="text-right">
          <p className="font-semibold uppercase text-slate-500">Payment</p>
          <p className="capitalize">{sale.payment_method}</p>
        </div>
      </div>

      <table className="mt-4 w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-300 px-2 py-1.5 text-left">#</th>
            <th className="border border-slate-300 px-2 py-1.5 text-left">Product</th>
            <th className="border border-slate-300 px-2 py-1.5 text-left">Batch</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Qty</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Rate</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Disc</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sale.items?.map((it, i) => (
            <tr key={it.id}>
              <td className="border border-slate-300 px-2 py-1.5">{i + 1}</td>
              <td className="border border-slate-300 px-2 py-1.5">
                {it.product_name}
                {it.packing_size ? ` (${it.packing_size})` : ""}
              </td>
              <td className="border border-slate-300 px-2 py-1.5">{it.batch_number}</td>
              <td className="border border-slate-300 px-2 py-1.5 text-right">
                {qty(it.quantity)} {it.unit}
              </td>
              <td className="border border-slate-300 px-2 py-1.5 text-right">{money(it.rate)}</td>
              <td className="border border-slate-300 px-2 py-1.5 text-right">{money(it.discount)}</td>
              <td className="border border-slate-300 px-2 py-1.5 text-right">{money(it.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-64 space-y-1 text-sm">
          <Totals sale={sale} />
        </div>
      </div>

      {/* Transport details (A4 only) */}
      {sale.transport_method && (
        <div className="mt-4 text-sm text-slate-700">
          {sale.transport_method === "vehicle" ? (
            <div>
              Transport: Vehicle {sale.vehicle_number || "—"} — Driver: {sale.driver_name || "—"}
              {sale.driver_cnic ? ` (CNIC: ${sale.driver_cnic})` : ""}
            </div>
          ) : sale.transport_method === "other" && sale.transport_notes ? (
            <div>Transport: {sale.transport_notes}</div>
          ) : null}
        </div>
      )}

      <div className="mt-10 flex justify-between text-xs text-slate-500">
        <p>Goods once sold are not returnable without the original invoice.</p>
        <p className="border-t border-slate-400 pt-1">Authorised signature</p>
      </div>
    </div>
  );
}

function Thermal({ sale, shopName, shop, width }) {
  const shopAddress = shop?.shop_address || "MADINA TRADERS NAWAN JANDAWALA SARGHODHA ROAD";
  const shopPhone = shop?.shop_phone || "0308-7616000";
  const shopEmail = shop?.shop_email || "rajputali78678690@gmail.com";
  return (
    <div className={`mx-auto receipt ${width === 58 ? "receipt-58" : ""} bg-white p-2`}>
      <div className="text-center">
        <p className="text-[13px] font-bold uppercase">{shopName}</p>
        <p>{shopAddress}</p>
        <p>{shopPhone}</p>
        <p>{shopEmail}</p>
      </div>
      <p className="my-1 border-t border-dashed border-slate-400" />
      <div className="flex justify-between">
        <span>{sale.invoice_number}</span>
        <span>{sale.date}</span>
      </div>
      <div>Customer: {sale.customer_name}</div>
      <p className="my-1 border-t border-dashed border-slate-400" />
      {sale.items?.map((it) => (
        <div key={it.id} className="mb-1">
          <div>{it.product_name}</div>
          <div className="flex justify-between">
            <span>
              {qty(it.quantity)} x {money(it.rate)}
            </span>
            <span>{money(it.line_total)}</span>
          </div>
        </div>
      ))}
      <p className="my-1 border-t border-dashed border-slate-400" />
      <Totals sale={sale} />
      <p className="my-1 border-t border-dashed border-slate-400" />
      <p className="text-center">Thank you — visit again</p>
    </div>
  );
}
