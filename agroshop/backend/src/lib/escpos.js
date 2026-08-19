// Raw ESC/POS has no page-size concept, so it sidesteps the Windows printer
// driver bug entirely. Unlike window.print(), it does not depend on the driver
// honoring a requested receipt width or page height before rendering.
const CHARS_PER_LINE = { 58: 32, 80: 48 };

const bytes = (...values) => Buffer.from(values);
const text = (value) => Buffer.from(String(value ?? ""), "latin1");

export function row(left, right, width) {
  const rightText = String(right ?? "");
  let leftText = String(left ?? "");
  const availableLeft = Math.max(0, width - rightText.length - 1);

  if (leftText.length + rightText.length > width) {
    leftText = leftText.slice(0, availableLeft);
  }

  const spaces = Math.max(1, width - leftText.length - rightText.length);
  return `${leftText}${" ".repeat(spaces)}${rightText}`.slice(0, width);
}

export function buildReceiptBuffer({ sale, shop, width = 80, money, qty }) {
  const lineWidth = CHARS_PER_LINE[width] ?? CHARS_PER_LINE[80];
  const chunks = [];
  const write = (...parts) => chunks.push(...parts);
  const line = (value = "") => write(text(value), bytes(0x0a));
  const separator = () => line("-".repeat(lineWidth));
  const productName = (item) =>
    `${item.product_name ?? ""}${item.packing_size ? ` (${item.packing_size})` : ""}`;

  write(bytes(0x1b, 0x40));
  write(bytes(0x1b, 0x61, 0x01));
  write(bytes(0x1b, 0x45, 0x01), bytes(0x1b, 0x21, 0x10));
  line(shop?.shop_name ?? "");
  write(bytes(0x1b, 0x21, 0x00), bytes(0x1b, 0x45, 0x00));
  if (shop?.shop_address) line(shop.shop_address);
  if (shop?.shop_phone) line(shop.shop_phone);
  if (shop?.shop_email) line(shop.shop_email);

  write(bytes(0x1b, 0x61, 0x00));
  separator();
  line(row(sale.invoice_number, sale.date, lineWidth));
  line(`Customer: ${sale.customer_name ?? ""}`);
  separator();

  for (const item of sale.items ?? []) {
    line(productName(item));
    line(row(`${qty(item.quantity)} x ${money(item.rate)}`, money(item.line_total), lineWidth));
  }

  separator();
  write(bytes(0x1b, 0x45, 0x01));
  line(row("Total", money(sale.total_amount), lineWidth));
  write(bytes(0x1b, 0x45, 0x00));
  line(row("Paid", money(sale.paid_amount), lineWidth));
  write(bytes(0x1b, 0x45, 0x01));
  line(row("Balance", money(sale.remaining_amount), lineWidth));
  write(bytes(0x1b, 0x45, 0x00));
  separator();

  write(bytes(0x1b, 0x61, 0x01));
  line("Thank you - visit again");
  write(bytes(0x1b, 0x64, 0x03));
  write(bytes(0x1d, 0x56, 0x01));

  return Buffer.concat(chunks);
}
