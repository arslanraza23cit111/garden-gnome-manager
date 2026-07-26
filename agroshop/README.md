# AgroShop — Fertilizer &amp; Pesticides Business Management

Offline business management app for a fertilizer / pesticides retail shop.
Runs entirely on **one Windows PC**, in the browser, with **no internet connection**.

- Frontend: React 18 + Vite + Tailwind CSS
- Backend: Node.js + Express (REST API)
- Database: SQLite, one local file, via `better-sqlite3`
- Printing: browser `window.print()` — A4 invoice + 80mm thermal receipt

---

## 1. Requirements

- **Node.js 20 or newer** (includes npm) — https://nodejs.org
- Windows 10/11 (also works on macOS/Linux)
- Nothing else. No internet needed after the first `npm install`.

## 2. Setup (once)

Open a terminal in the `agroshop` folder:

```bash
npm run setup
```

That command:

1. installs the root, backend and frontend dependencies,
2. creates the SQLite database file and all tables,
3. loads demo data (10 products, 5 customers, 4 suppliers, 4 purchases, 4 sales).

> `better-sqlite3` downloads a prebuilt binary during install. Do this step
> **while you still have internet**. After that the app never needs a network.

## 3. Run the app every day

```bash
npm start
```

Then open **http://localhost:5173** in the browser.

| Login    | Password   |
| -------- | ---------- |
| `admin`  | `admin123` |

Change the password from the app (Settings, Phase 2) or re-seed with a new hash.

Ports: frontend `5173`, API `5174`. Vite proxies `/api` to the backend, so the
browser only ever talks to `localhost`.

Use `npm run dev` instead of `npm start` if you want the backend to auto-restart
while editing code.

## 4. Where the data lives

```
agroshop/backend/data/agroshop.db        <-- the whole business, one file
agroshop/backend/data/agroshop.db-wal    <-- write-ahead log (part of the DB)
agroshop/backend/data/agroshop.db-shm
```

### Backing up (important)

There is **no cloud copy**. Back up manually and often:

1. Close the app (stop the terminal with `Ctrl + C`) so the WAL is flushed.
2. Copy the whole `backend\data` folder to a USB drive or another disk.
3. Keep dated copies, e.g. `agroshop-2026-07-26.db`.

Restoring = copy the file back into `backend\data\`.

A one-click "Backup now" button is part of Phase 3.

### Resetting the demo data

```bash
npm run seed:reset
```

Deletes the database file and rebuilds it with fresh demo data. **Never run this
on real shop data.**

## 5. Tests

```bash
npm test
```

Integration tests run against a throwaway database and assert the
non-negotiable rules:

- purchase → batch stock increases, supplier payable increases
- sale → stock decreases, customer receivable increases
- selling more than available stock is rejected and **writes nothing**
- a bad line rolls the whole sale back (atomicity)
- FEFO: the nearest-expiry batch is consumed first
- total debit always equals total credit in `ledger_entries`

## 6. What is built (Phase 1 — MVP)

| Module          | Status                                                              |
| --------------- | ------------------------------------------------------------------- |
| Login           | Single admin user; `users.role` already supports future roles       |
| Dashboard       | Sales, purchase, profit, cash/bank, outstanding, stock value, alerts |
| Products        | Batch + expiry stock, min level, four price levels                  |
| Purchase entry  | Multi-line, auto stock in + supplier ledger, atomic                 |
| Sale entry      | Multi-line, FEFO stock out + customer ledger, atomic, invoice print |
| Customers       | Full profile, credit limit, opening balance, running ledger         |
| Suppliers       | Full profile, opening payable, running ledger                       |

The **database schema for every later phase already exists** (returns, payments,
expenses, employees, salary payments, activity log, settings) — later phases add
screens, not migrations.

Planned: Phase 2 returns / payments / expenses / settings · Phase 3 accounts,
roles, backup · Phase 4 reports and analytics.

## 7. How the money and stock rules are enforced

- Stock quantity lives **only** in `product_batches`, per batch + expiry. No
  total-quantity column on `products`, and no screen lets you type a stock number.
- All balances (customer, supplier, cash, bank) are **derived** from the single
  double-entry `ledger_entries` table. Nothing stores a balance that could drift.
- `stockService.js` is the only file that writes stock; `ledgerService.js` is the
  only file that writes ledger entries. Every route calls into them.
- Every purchase / sale runs inside one `better-sqlite3` transaction — document,
  stock movement and ledger entries all commit together or not at all.
- `ledgerService.post()` refuses an unbalanced set of entries, so the books
  cannot go out of balance even by a rounding error.

## 8. Folder layout

```
agroshop/
  backend/
    src/
      db/         schema.sql, connection.js, seed.js
      routes/     auth, products, purchases, sales, customers, suppliers, dashboard
      services/   stockService.js, ledgerService.js   <-- all stock/ledger writes
      lib/        auth.js (login, roles, activity log), util.js (validation)
      app.js, server.js
    tests/        flows.test.js
    data/         agroshop.db (created on first run, gitignored)
  frontend/
    src/
      pages/      Login, Dashboard, Products, Purchases, Sales, Customers, Suppliers
      components/ Sidebar, MetricCard, DataTable, Modal, InvoicePrint
      api/        client.js
      App.jsx, main.jsx, index.css
```

## 9. Printing

Open any sale → **Invoice**. One dialog, two layouts:

- **A4 invoice** — shop name, address, phone, invoice no., date, itemised table, totals.
- **Thermal receipt** — 80mm narrow monospace layout for a receipt printer.

Both print through the browser dialog; pick the right printer there. No PDF
service, no internet.

## 10. Troubleshooting

| Symptom                                        | Fix                                                                    |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| "Cannot reach the local server"                | The API is not running — use `npm start`, check port 5174 is free.      |
| `better-sqlite3` install fails                 | Install Node 20+ and re-run `npm install` with internet available.     |
| Port 5173 or 5174 already in use               | Close the other program, or change the port in `frontend/vite.config.js` / `PORT` env. |
| Forgot the password                            | Re-run `npm run seed:reset` (demo data only) or reset the hash in the DB. |
