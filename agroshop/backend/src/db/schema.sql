-- AgroShop — full schema (all phases). Stock lives ONLY in product_batches.
-- All balances are DERIVED from ledger_entries. No standalone balance columns.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT,
  role          TEXT NOT NULL DEFAULT 'admin'
                CHECK (role IN ('admin','manager','accountant','salesman','storekeeper')),
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS products (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  company         TEXT,
  category        TEXT,
  type            TEXT,
  unit            TEXT NOT NULL DEFAULT 'bag',
  packing_size    TEXT,
  purchase_price  REAL NOT NULL DEFAULT 0,
  sale_price      REAL NOT NULL DEFAULT 0,
  retail_price    REAL NOT NULL DEFAULT 0,
  wholesale_price REAL NOT NULL DEFAULT 0,
  min_stock_level REAL NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Stock quantity is tracked HERE, per batch + expiry. Never on products.
CREATE TABLE IF NOT EXISTS product_batches (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    INTEGER NOT NULL REFERENCES products(id),
  batch_number  TEXT NOT NULL DEFAULT '-',
  expiry_date   TEXT,
  quantity      REAL NOT NULL DEFAULT 0,
  purchase_rate REAL NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (product_id, batch_number, expiry_date)
);
CREATE INDEX IF NOT EXISTS idx_batches_product ON product_batches(product_id);

CREATE TABLE IF NOT EXISTS customers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  father_name     TEXT,
  cnic            TEXT,
  mobile          TEXT,
  address         TEXT,
  area            TEXT,
  customer_type   TEXT NOT NULL DEFAULT 'farmer'
                  CHECK (customer_type IN ('farmer','dealer','walk-in')),
  credit_limit    REAL NOT NULL DEFAULT 0,
  opening_balance REAL NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  company         TEXT,
  contact         TEXT,
  address         TEXT,
  opening_balance REAL NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS purchases (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id      INTEGER NOT NULL REFERENCES suppliers(id),
  invoice_number   TEXT NOT NULL,
  date             TEXT NOT NULL,
  total_amount     REAL NOT NULL DEFAULT 0,
  discount_amount  REAL NOT NULL DEFAULT 0,
  tax_amount       REAL NOT NULL DEFAULT 0,
  paid_amount      REAL NOT NULL DEFAULT 0,
  remaining_amount REAL NOT NULL DEFAULT 0,
  payment_method   TEXT NOT NULL DEFAULT 'cash'
                   CHECK (payment_method IN ('cash','bank','cheque','online','credit')),
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','void')),
  created_by       INTEGER REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id   INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id    INTEGER NOT NULL REFERENCES products(id),
  batch_number  TEXT NOT NULL DEFAULT '-',
  expiry_date   TEXT,
  quantity      REAL NOT NULL,
  rate          REAL NOT NULL,
  discount      REAL NOT NULL DEFAULT 0,
  tax           REAL NOT NULL DEFAULT 0,
  line_total    REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS sales (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id      INTEGER NOT NULL REFERENCES customers(id),
  invoice_number   TEXT NOT NULL,
  date             TEXT NOT NULL,
  total_amount     REAL NOT NULL DEFAULT 0,
  discount_amount  REAL NOT NULL DEFAULT 0,
  paid_amount      REAL NOT NULL DEFAULT 0,
  remaining_amount REAL NOT NULL DEFAULT 0,
  payment_method   TEXT NOT NULL DEFAULT 'cash'
                   CHECK (payment_method IN ('cash','bank','cheque','online','credit')),
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','void')),
  created_by       INTEGER REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sale_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id      INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id   INTEGER NOT NULL REFERENCES products(id),
  batch_id     INTEGER REFERENCES product_batches(id),
  batch_number TEXT NOT NULL DEFAULT '-',
  quantity     REAL NOT NULL,
  rate         REAL NOT NULL,
  discount     REAL NOT NULL DEFAULT 0,
  cost_rate    REAL NOT NULL DEFAULT 0,   -- for profit reports
  line_total   REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id  INTEGER REFERENCES purchases(id),
  supplier_id  INTEGER NOT NULL REFERENCES suppliers(id),
  date         TEXT NOT NULL,
  reason       TEXT,
  total_amount REAL NOT NULL DEFAULT 0,
  created_by   INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_return_id INTEGER NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  product_id         INTEGER NOT NULL REFERENCES products(id),
  batch_number       TEXT NOT NULL DEFAULT '-',
  quantity           REAL NOT NULL,
  rate               REAL NOT NULL,
  line_total         REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS sale_returns (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id      INTEGER REFERENCES sales(id),
  customer_id  INTEGER NOT NULL REFERENCES customers(id),
  date         TEXT NOT NULL,
  reason       TEXT,
  total_amount REAL NOT NULL DEFAULT 0,
  created_by   INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sale_return_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_return_id INTEGER NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
  product_id     INTEGER NOT NULL REFERENCES products(id),
  batch_number   TEXT NOT NULL DEFAULT '-',
  expiry_date    TEXT,
  quantity       REAL NOT NULL,
  rate           REAL NOT NULL,
  line_total     REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  direction  TEXT NOT NULL CHECK (direction IN ('in','out')),
  party_type TEXT NOT NULL CHECK (party_type IN ('customer','supplier')),
  party_id   INTEGER NOT NULL,
  amount     REAL NOT NULL,
  method     TEXT NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','bank','cheque','online')),
  date       TEXT NOT NULL,
  reference  TEXT,
  notes      TEXT,
  status     TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','void')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category    TEXT NOT NULL,
  amount      REAL NOT NULL,
  date        TEXT NOT NULL,
  method      TEXT NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','bank')),
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','void')),
  created_by  INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS employees (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  mobile       TEXT,
  salary       REAL NOT NULL DEFAULT 0,
  joining_date TEXT,
  role         TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS employee_salary_payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  amount      REAL NOT NULL,
  date        TEXT NOT NULL,
  method      TEXT NOT NULL DEFAULT 'cash',
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- THE single source of truth for every balance (double-entry).
CREATE TABLE IF NOT EXISTS ledger_entries (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  date           TEXT NOT NULL,
  account_type   TEXT NOT NULL CHECK (account_type IN
                   ('customer','supplier','cash','bank','sales','purchases',
                    'expense','capital','sales_return','purchase_return')),
  account_ref_id INTEGER,
  debit          REAL NOT NULL DEFAULT 0,
  credit         REAL NOT NULL DEFAULT 0,
  source_type    TEXT NOT NULL CHECK (source_type IN
                   ('sale','purchase','payment','expense','sale_return',
                    'purchase_return','opening','salary')),
  source_id      INTEGER,
  description    TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_ledger_account ON ledger_entries(account_type, account_ref_id);
CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger_entries(date);
CREATE INDEX IF NOT EXISTS idx_ledger_source ON ledger_entries(source_type, source_id);

CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id),
  action     TEXT NOT NULL,
  table_name TEXT,
  record_id  INTEGER,
  details    TEXT,
  timestamp  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
