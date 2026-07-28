import { Router } from "express";
import { getDb } from "../db/connection.js";
import { num } from "../lib/util.js";

const router = Router();

const MAX_LIMIT = 100;

function cleanString(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

router.get("/", (req, res) => {
  const limit = Math.min(Math.max(num(req.query.limit, 25), 1), MAX_LIMIT);
  const offset = Math.max(num(req.query.offset, 0), 0);
  const where = [];
  const params = {};

  const userId = cleanString(req.query.user_id);
  const action = cleanString(req.query.action);
  const tableName = cleanString(req.query.table_name);
  const from = cleanString(req.query.from);
  const to = cleanString(req.query.to);

  if (userId) {
    where.push("a.user_id = @user_id");
    params.user_id = num(userId);
  }
  if (action) {
    where.push("a.action = @action");
    params.action = action;
  }
  if (tableName) {
    where.push("a.table_name = @table_name");
    params.table_name = tableName;
  }
  if (from) {
    where.push("date(a.timestamp) >= date(@from)");
    params.from = from;
  }
  if (to) {
    where.push("date(a.timestamp) <= date(@to)");
    params.to = to;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = getDb()
    .prepare(
      `SELECT a.id, a.user_id, u.username, u.full_name, a.action, a.table_name,
              a.record_id, a.details, a.timestamp
         FROM activity_log a
         LEFT JOIN users u ON u.id = a.user_id
        ${whereSql}
        ORDER BY a.timestamp DESC, a.id DESC
        LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit, offset });

  const total = getDb()
    .prepare(
      `SELECT COUNT(*) AS total
         FROM activity_log a
        ${whereSql}`,
    )
    .get(params).total;

  res.json({ rows, total, limit, offset });
});

export default router;
