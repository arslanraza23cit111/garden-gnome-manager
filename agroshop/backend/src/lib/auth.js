import crypto from "node:crypto";
import { getDb } from "../db/connection.js";

const SECRET = process.env.AGROSHOP_SECRET || "agroshop-local-dev-secret";

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const known = Buffer.from(hash, "hex");
  return test.length === known.length && crypto.timingSafeEqual(test, known);
}

export function issueToken(user) {
  const payload = Buffer.from(
    JSON.stringify({ id: user.id, username: user.username, role: user.role, t: Date.now() }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function readToken(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  if (sig !== expected) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/** Express middleware: requires a valid local session token. */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const user = readToken(header.replace(/^Bearer\s+/i, ""));
  if (!user) return res.status(401).json({ error: "Not signed in" });
  req.user = user;
  next();
}

/** Phase 3 hook — roles already exist in the users table. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not signed in" });
    if (roles.length && !roles.includes(req.user.role))
      return res.status(403).json({ error: "You do not have permission for this action" });
    next();
  };
}

export function logActivity(user_id, action, table_name, record_id, details) {
  getDb()
    .prepare(
      `INSERT INTO activity_log (user_id, action, table_name, record_id, details)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(user_id ?? null, action, table_name ?? null, record_id ?? null, details ?? null);
}
