import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";

const DB_PATH = process.env.BUDGET_DB_PATH ?? "./data/budget.db";

let instance: Database.Database | null = null;

export function db(): Database.Database {
  if (instance) return instance;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  instance = new Database(DB_PATH);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  migrate(instance);
  return instance;
}

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL CHECK(source IN ('credit_card','venmo','splitwise')),
      external_id TEXT,
      date TEXT NOT NULL,
      amount_total REAL NOT NULL,
      amount_my_share REAL NOT NULL,
      payer TEXT NOT NULL CHECK(payer IN ('me','other','shared')) DEFAULT 'me',
      merchant_raw TEXT NOT NULL,
      merchant_normalized TEXT NOT NULL,
      description TEXT,
      category TEXT,
      currency TEXT NOT NULL DEFAULT 'USD',
      reconciled INTEGER NOT NULL DEFAULT 0,
      raw_json TEXT,
      UNIQUE(source, external_id)
    );

    CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_txn_source ON transactions(source);
    CREATE INDEX IF NOT EXISTS idx_txn_reconciled ON transactions(reconciled);

    CREATE TABLE IF NOT EXISTS merge_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_merchant TEXT NOT NULL,
      canonical_date TEXT NOT NULL,
      true_my_share REAL NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS merge_links (
      merge_group_id INTEGER NOT NULL REFERENCES merge_groups(id) ON DELETE CASCADE,
      transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('cc_charge','splitwise_share','venmo_settlement','venmo_reimbursement')),
      PRIMARY KEY(merge_group_id, transaction_id)
    );

    CREATE TABLE IF NOT EXISTS import_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      filename TEXT,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      row_count INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS category_suggestions (
      transaction_id INTEGER PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
      suggested_category TEXT NOT NULL,
      reason TEXT,
      confidence REAL NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const txnColumns = new Set(
    (d.prepare("PRAGMA table_info(transactions)").all() as Array<{ name: string }>).map(
      (col) => col.name,
    ),
  );
  if (!txnColumns.has("mine_only")) {
    d.exec("ALTER TABLE transactions ADD COLUMN mine_only INTEGER NOT NULL DEFAULT 0");
  }
  d.exec("CREATE INDEX IF NOT EXISTS idx_txn_mine_only ON transactions(mine_only)");

  const mergeLinksSql = d
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'merge_links'")
    .get() as { sql: string } | undefined;
  if (mergeLinksSql && !mergeLinksSql.sql.includes("venmo_reimbursement")) {
    d.transaction(() => {
      d.exec(`
        ALTER TABLE merge_links RENAME TO merge_links_old;

        CREATE TABLE merge_links (
          merge_group_id INTEGER NOT NULL REFERENCES merge_groups(id) ON DELETE CASCADE,
          transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK(role IN ('cc_charge','splitwise_share','venmo_settlement','venmo_reimbursement')),
          PRIMARY KEY(merge_group_id, transaction_id)
        );

        INSERT INTO merge_links(merge_group_id, transaction_id, role)
        SELECT merge_group_id, transaction_id, role
        FROM merge_links_old;

        DROP TABLE merge_links_old;
      `);
    })();
  }
}

export function getSetting(key: string): string | null {
  const row = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  db()
    .prepare(
      "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

export function clearDatabase() {
  const d = db();
  const reset = d.transaction(() => {
    d.prepare("DELETE FROM category_suggestions").run();
    d.prepare("DELETE FROM merge_links").run();
    d.prepare("DELETE FROM merge_groups").run();
    d.prepare("DELETE FROM transactions").run();
    d.prepare("DELETE FROM import_batches").run();
    d.prepare("DELETE FROM settings").run();
    d.prepare("DELETE FROM sqlite_sequence").run();
  });
  reset();
}
