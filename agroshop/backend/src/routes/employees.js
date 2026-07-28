import { Router } from "express";
import { getDb, tx } from "../db/connection.js";
import { recordExpense } from "../services/expenseService.js";
import { ValidationError, required, num, round2, today } from "../lib/util.js";
import { logActivity } from "../lib/auth.js";

const router = Router();

const listPayments = (employeeId) =>
  getDb()
    .prepare(`SELECT * FROM employee_salary_payments WHERE employee_id = ? ORDER BY date DESC, id DESC`)
    .all(employeeId);

router.get("/", (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT e.*,
              (SELECT COALESCE(SUM(p.amount),0) FROM employee_salary_payments p WHERE p.employee_id = e.id) AS total_paid,
              (SELECT MAX(p.date) FROM employee_salary_payments p WHERE p.employee_id = e.id) AS last_paid_on
         FROM employees e
        ORDER BY e.is_active DESC, e.name`,
    )
    .all();
  const active = req.query.active;
  if (active === "1") return res.json(rows.filter((r) => r.is_active === 1));
  res.json(rows);
});

router.get("/:id/payments", (req, res) => {
  res.json(listPayments(Number(req.params.id)));
});

router.post("/", (req, res) => {
  const body = req.body ?? {};
  required(body.name, "Name");
  const salary = round2(num(body.salary));
  if (salary < 0) throw new ValidationError("Salary cannot be negative");

  const info = getDb()
    .prepare(
      `INSERT INTO employees (name, mobile, salary, joining_date, role, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      String(body.name).trim(),
      body.mobile ?? null,
      salary,
      body.joining_date || today(),
      body.role ?? null,
      body.is_active === 0 || body.is_active === false ? 0 : 1,
    );
  const id = Number(info.lastInsertRowid);
  logActivity(req.user?.id, "create", "employees", id, String(body.name));
  res.status(201).json(getDb().prepare(`SELECT * FROM employees WHERE id = ?`).get(id));
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = getDb().prepare(`SELECT * FROM employees WHERE id = ?`).get(id);
  if (!existing) throw Object.assign(new Error("Employee not found"), { status: 404 });
  const body = req.body ?? {};
  required(body.name ?? existing.name, "Name");
  const salary = body.salary === undefined ? existing.salary : round2(num(body.salary));
  if (salary < 0) throw new ValidationError("Salary cannot be negative");

  getDb()
    .prepare(
      `UPDATE employees SET name = ?, mobile = ?, salary = ?, joining_date = ?, role = ? WHERE id = ?`,
    )
    .run(
      String(body.name ?? existing.name).trim(),
      body.mobile ?? existing.mobile,
      salary,
      body.joining_date ?? existing.joining_date,
      body.role ?? existing.role,
      id,
    );
  logActivity(req.user?.id, "update", "employees", id, String(body.name ?? existing.name));
  res.json(getDb().prepare(`SELECT * FROM employees WHERE id = ?`).get(id));
});

/** Never hard-delete: payment history must survive. */
router.post("/:id/deactivate", (req, res) => {
  const id = Number(req.params.id);
  const existing = getDb().prepare(`SELECT * FROM employees WHERE id = ?`).get(id);
  if (!existing) throw Object.assign(new Error("Employee not found"), { status: 404 });
  getDb().prepare(`UPDATE employees SET is_active = 0 WHERE id = ?`).run(id);
  logActivity(req.user?.id, "deactivate", "employees", id, existing.name);
  res.json(getDb().prepare(`SELECT * FROM employees WHERE id = ?`).get(id));
});

router.post("/:id/reactivate", (req, res) => {
  const id = Number(req.params.id);
  const existing = getDb().prepare(`SELECT * FROM employees WHERE id = ?`).get(id);
  if (!existing) throw Object.assign(new Error("Employee not found"), { status: 404 });
  getDb().prepare(`UPDATE employees SET is_active = 1 WHERE id = ?`).run(id);
  logActivity(req.user?.id, "reactivate", "employees", id, existing.name);
  res.json(getDb().prepare(`SELECT * FROM employees WHERE id = ?`).get(id));
});

/** Salary payment = an expense in category "salary" + a payment history row. */
router.post("/:id/salary-payments", (req, res) => {
  const id = Number(req.params.id);
  const employee = getDb().prepare(`SELECT * FROM employees WHERE id = ?`).get(id);
  if (!employee) throw Object.assign(new Error("Employee not found"), { status: 404 });
  const body = req.body ?? {};
  const date = body.date || today();
  const method = body.method || "cash";
  const amount = round2(num(body.amount));
  if (amount <= 0) throw new ValidationError("Amount must be greater than zero");

  const result = tx(() => {
    const expense = recordExpense({
      category: "salary",
      amount,
      date,
      method,
      description: `Salary — ${employee.name}${body.notes ? ` (${body.notes})` : ""}`,
      created_by: req.user?.id ?? null,
    });
    const info = getDb()
      .prepare(
        `INSERT INTO employee_salary_payments (employee_id, amount, date, method, notes)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, expense.amount, date, method, body.notes ?? null);
    return { id: Number(info.lastInsertRowid), expense_id: expense.id, amount: expense.amount, date, method };
  })();

  logActivity(req.user?.id, "create", "employee_salary_payments", result.id, `${employee.name} / ${amount}`);
  res.status(201).json(result);
});

export default router;
