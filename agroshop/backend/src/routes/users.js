import { Router } from "express";
import { getDb } from "../db/connection.js";
import { hashPassword, logActivity } from "../lib/auth.js";
import { ValidationError, required } from "../lib/util.js";

const router = Router();
const ROLES = ["admin", "manager", "accountant", "salesman", "storekeeper"];

const publicFields = `
  SELECT id, username, full_name, role, is_active, created_at
    FROM users
`;

router.get("/", (_req, res) => {
  res.json(getDb().prepare(`${publicFields} ORDER BY is_active DESC, username ASC`).all());
});

router.post("/", (req, res) => {
  const body = req.body ?? {};
  required(body.username, "Username");
  required(body.password, "Password");
  if (String(body.password).length < 4) throw new ValidationError("Password must be at least 4 characters");
  if (!ROLES.includes(body.role)) throw new ValidationError("Choose a valid role");

  try {
    const info = getDb()
      .prepare(
        `INSERT INTO users (username, password_hash, full_name, role, is_active)
         VALUES (?, ?, ?, ?, 1)`,
      )
      .run(
        String(body.username).trim(),
        hashPassword(body.password),
        body.full_name ?? null,
        body.role,
      );
    const id = Number(info.lastInsertRowid);
    logActivity(req.user?.id, "create", "users", id, body.username);
    res.status(201).json({ id });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) throw new ValidationError("Username already exists");
    throw e;
  }
});

router.put("/:id", (req, res) => {
  const body = req.body ?? {};
  if (!ROLES.includes(body.role)) throw new ValidationError("Choose a valid role");
  getDb()
    .prepare(`UPDATE users SET full_name = ?, role = ? WHERE id = ?`)
    .run(body.full_name ?? null, body.role, req.params.id);
  logActivity(req.user?.id, "update", "users", Number(req.params.id), body.role);
  res.json({ ok: true });
});

router.patch("/:id/deactivate", (req, res) => {
  if (Number(req.params.id) === req.user?.id) throw new ValidationError("You cannot deactivate your own user");
  getDb().prepare(`UPDATE users SET is_active = 0 WHERE id = ?`).run(req.params.id);
  logActivity(req.user?.id, "deactivate", "users", Number(req.params.id), null);
  res.json({ ok: true });
});

export default router;
