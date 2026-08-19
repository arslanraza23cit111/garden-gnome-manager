// Raw ESC/POS has no page-size concept, so it sidesteps the Windows printer
// driver bug entirely. Unlike window.print(), it does not depend on the driver
// honoring a requested receipt width or page height before rendering.
const CHARS_PER_LINE = { 58: 32, 80: 48 };
const SIDE_MARGIN = "  ";

const bytes = (...values) => Buffer.from(values);
const sanitizeText = (value) =>
  String(value ?? "")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x20-\x7E]/g, "?");
const text = (value) => Buffer.from(sanitizeText(value), "latin1");
const printable = (value) => sanitizeText(value).trim();

function wrapWords(value, width) {
  const words = printable(value).split(/\s+/).filter(Boolean);
  const lines = [];

  for (const word of words) {
    if (!lines.length) {
      lines.push(word);
      continue;
    }

    const current = lines[lines.length - 1];
    if (current.length + 1 + word.length <= width) {
      lines[lines.length - 1] = `${current} ${word}`;
    } else {
      lines.push(word);
    }
  }

  return lines.flatMap((line) => {
    if (line.length <= width) return line;
    const chunks = [];
    for (let i = 0; i < line.length; i += width) chunks.push(line.slice(i, i + width));
    return chunks;
  });
}

export function row(left, right, width) {
  const rightText = printable(right);
  let leftText = printable(left);
  const availableLeft = Math.max(0, width - rightText.length - 1);

  if (leftText.length + rightText.length > width) {
    leftText = leftText.slice(0, availableLeft);
  }

  const spaces = Math.max(1, width - leftText.length - rightText.length);
  return `${leftText}${" ".repeat(spaces)}${rightText}`.slice(0, width);
}

export function buildReceiptBuffer({ sale, shop, width = 80, money, qty }) {
  const lineWidth = CHARS_PER_LINE[width] ?? CHARS_PER_LINE[80];
  const contentWidth = lineWidth - SIDE_MARGIN.length * 2;
  const chunks = [];
  const write = (...parts) => chunks.push(...parts);
  const line = (value = "") => write(text(value), bytes(0x0a));
  const contentLine = (value = "") => line(`${SIDE_MARGIN}${value}`);
  const wrappedContentLine = (value = "") => {
    const lines = wrapWords(value, contentWidth);
    if (!lines.length) contentLine();
    for (const wrappedLine of lines) contentLine(wrappedLine);
  };
  const outerSeparator = () => line("=".repeat(lineWidth));
  const separator = () => contentLine("-".repeat(contentWidth));
  const productName = (item) =>
    `${item.product_name ?? ""}${item.packing_size ? ` (${item.packing_size})` : ""}`;
  const items = sale.items ?? [];
  const totalQty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const hasBalance = Number(sale.remaining_amount || 0) > 0;
  const createdBy = printable(sale.created_by_name);
  const tagline = printable(shop?.shop_tagline);

  write(bytes(0x1b, 0x40));
  write(bytes(0x1b, 0x61, 0x01));
  write(bytes(0x1b, 0x45, 0x01), bytes(0x1b, 0x21, 0x10));
  line(shop?.shop_name ?? "");
  write(bytes(0x1b, 0x21, 0x00), bytes(0x1b, 0x45, 0x00));
  if (shop?.shop_address) line(shop.shop_address);
  if (shop?.shop_phone) line(shop.shop_phone);
  if (shop?.shop_email) line(shop.shop_email);

  write(bytes(0x1b, 0x61, 0x00));
  line();
  outerSeparator();
  contentLine(row(sale.invoice_number, sale.date, contentWidth));
  wrappedContentLine(`Customer: ${sale.customer_name ?? ""}`);
  if (createdBy) contentLine(`Served by: ${createdBy}`);
  separator();
  contentLine(row(`Items: ${items.length}`, `Qty: ${qty(totalQty)}`, contentWidth));
  line();

  for (const item of items) {
    wrappedContentLine(productName(item));
    contentLine(row(`  ${qty(item.quantity)} x ${money(item.rate)}`, money(item.line_total), contentWidth));
    line();
  }

  separator();
  write(bytes(0x1b, 0x45, 0x01));
  contentLine(row("Total", money(sale.total_amount), contentWidth));
  write(bytes(0x1b, 0x45, 0x00));
  contentLine(row("Paid", money(sale.paid_amount), contentWidth));
  if (hasBalance) {
    line();
    write(bytes(0x1b, 0x45, 0x01));
    contentLine(row("BALANCE DUE", money(sale.remaining_amount), contentWidth));
    write(bytes(0x1b, 0x45, 0x00));
    line();
  } else {
    write(bytes(0x1b, 0x45, 0x01));
    contentLine(row("Balance", money(sale.remaining_amount), contentWidth));
    write(bytes(0x1b, 0x45, 0x00));
  }
  outerSeparator();

  write(bytes(0x1b, 0x61, 0x01));
  line(tagline || "Thank you - visit again");
  if (tagline) line("Thank you - visit again");
  line();
  line();
  write(bytes(0x1d, 0x56, 0x42, 0x03));

  return Buffer.concat(chunks);
}
