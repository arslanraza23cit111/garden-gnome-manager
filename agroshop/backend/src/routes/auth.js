import { Router } from "express";
import { getDb } from "../db/connection.js";
import { hashPassword, verifyPassword, issueToken, requireAuth, logActivity } from "../lib/auth.js";
import { ValidationError, required } from "../lib/util.js";

const router = Router();

router.post("/login", (req, res) => {
  const { username, password } = req.body ?? {};
  required(username, "Username");
  required(password, "Password");
  const user = getDb()
    .prepare(`SELECT * FROM users WHERE username = ? AND is_active = 1`)
    .get(String(username).trim());
  if (!user || !verifyPassword(password, user.password_hash))
    throw Object.assign(new ValidationError("Invalid username or password"), { status: 401 });
  logActivity(user.id, "login", "users", user.id, null);
  res.json({
    token: issueToken(user),
    user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role },
  });
});

router.get("/me", requireAuth, (req, res) => {
  const user = getDb()
    .prepare(`SELECT id, username, full_name, role FROM users WHERE id = ?`)
    .get(req.user.id);
  res.json({ user });
});

router.post("/change-password", requireAuth, (req, res) => {
  const { current_password, new_password } = req.body ?? {};
  const user = getDb().prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  if (!verifyPassword(current_password ?? "", user.password_hash))
    throw new ValidationError("Current password is incorrect");
  if (String(new_password ?? "").length < 4)
    throw new ValidationError("New password must be at least 4 characters");
  getDb().prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hashPassword(new_password), user.id);
  res.json({ ok: true });
});

export default router;
