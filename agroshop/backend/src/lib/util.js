import { getDb } from "../db/connection.js";

export const today = () => new Date().toISOString().slice(0, 10);
export const monthStart = () => today().slice(0, 7) + "-01";

export const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Throws a 400-style error with a human message. */
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

export function required(value, label) {
  if (value === undefined || value === null || String(value).trim() === "")
    throw new ValidationError(`${label} is required`);
  return value;
}

/** Next invoice number like SL-0001 / PR-0001, per table. */
export function nextInvoiceNumber(table, prefix) {
  const row = getDb().prepare(`SELECT COUNT(*) AS c FROM ${table}`).get();
  return `${prefix}-${String(row.c + 1).padStart(4, "0")}`;
}
