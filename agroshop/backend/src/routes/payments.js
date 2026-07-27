import { Router } from "express";
import { getDb, tx } from "../db/connection.js";
import * as ledger from "../services/ledgerService.js";
import { ValidationError, required, num, round2, today } from "../lib/util.js";
import { logActivity } from "../lib/auth.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json(getDb().prepare(`SELECT * FROM payments ORDER BY id DESC`).all());
});

router.post("/", (req, res) => {
  const body = req.body ?? {};
  const date = body.date || today();
  required(body.direction, "Direction");
  required(body.party_type, "Party type");
  required(body.party_id, "Party");
  const amount = round2(num(body.amount));
  if (amount <= 0) throw new ValidationError("Amount must be greater than zero");
  if (!["customer", "supplier"].includes(body.party_type)) throw new ValidationError("Party type must be customer or supplier");
  if (!["cash", "bank", "cheque", "online"].includes(body.method)) throw new ValidationError("Unsupported payment method");

  const party = getDb()
    .prepare(`SELECT * FROM ${body.party_type === "customer" ? "customers" : "suppliers"} WHERE id = ?`)
    .get(body.party_id);
  if (!party) throw new ValidationError(`${body.party_type} not found`);

  const currentBalance = ledger.balanceOf(body.party_type, party.id);
  const wouldBe = body.direction === "in"
    ? round2(currentBalance - amount)
    : round2(currentBalance + amount);

  const overpay = body.direction === "in"
    ? wouldBe < 0
    : wouldBe > 0;

  if (overpay && !body.confirm_overpay) {
    throw new ValidationError(`This payment would overpay the ${body.party_type} beyond the current balance`);
  }

  const reference = String(body.reference || `PMT-${Date.now()}`).trim();
  const id = tx(() => {
    const info = getDb()
      .prepare(
        `INSERT INTO payments (direction, party_type, party_id, amount, method, date, reference, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(body.direction, body.party_type, party.id, amount, body.method, date, reference, body.notes ?? null, req.user?.id ?? null);

    const paymentId = Number(info.lastInsertRowid);
    const entries = [];
    if (body.direction === "in") {
      entries.push({ account_type: body.party_type, account_ref_id: party.id, credit: amount });
      entries.push({ account_type: ledger.moneyAccount(body.method), debit: amount });
    } else {
      entries.push({ account_type: body.party_type, account_ref_id: party.id, debit: amount });
      entries.push({ account_type: ledger.moneyAccount(body.method), credit: amount });
    }
    ledger.post(entries, {
      date,
      source_type: "payment",
      source_id: paymentId,
      description: `${body.direction === "in" ? "Receipt" : "Payment"} ${reference}`,
    });
    return paymentId;
  })();

  logActivity(req.user?.id, "create", "payments", id, `${body.direction} / ${amount}`);
  res.status(201).json({ id, reference, amount });
});

export default router;
