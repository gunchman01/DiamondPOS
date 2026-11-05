/**
 * Database migrations: each one changes the database schema a step at a time.
 *
 * RULES (these are what make "revert to previous version" safe):
 *  1. Never edit or delete a migration once it has been released. Add a new one.
 *  2. Only ADD things (tables, columns with defaults, indexes). Don't rename or
 *     drop columns that the previous version still reads.
 *  3. Remove old columns only several releases later, once no till runs a
 *     version that uses them (and raise MIN_CLIENT_VERSION at the same time).
 *
 * The server takes a backup copy of the database before applying any migration.
 */
export interface Migration {
  version: number
  name: string
  up: string
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    up: `
      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE products (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        sku         TEXT UNIQUE,
        barcode     TEXT UNIQUE,
        name        TEXT NOT NULL,
        price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
        active      INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE sales (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        till_name    TEXT NOT NULL,
        total_cents  INTEGER NOT NULL,
        tax_cents    INTEGER NOT NULL,
        change_cents INTEGER NOT NULL DEFAULT 0,
        status       TEXT NOT NULL DEFAULT 'completed'
      );
      CREATE INDEX idx_sales_created_at ON sales(created_at);

      CREATE TABLE sale_items (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id          INTEGER NOT NULL REFERENCES sales(id),
        product_id       INTEGER REFERENCES products(id),
        name             TEXT NOT NULL,
        unit_price_cents INTEGER NOT NULL,
        qty              INTEGER NOT NULL,
        line_total_cents INTEGER NOT NULL
      );

      CREATE TABLE payments (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id      INTEGER NOT NULL REFERENCES sales(id),
        method       TEXT NOT NULL CHECK (method IN ('cash', 'card')),
        amount_cents INTEGER NOT NULL,
        reference    TEXT
      );

      INSERT INTO settings (key, value) VALUES
        ('store_name', 'My Store'),
        ('tax_rate', '0.15'),
        ('receipt_footer', 'Thank you for shopping with us!');
    `
  },
  {
    version: 2,
    name: 'sample products',
    up: `
      INSERT INTO products (sku, barcode, name, price_cents) VALUES
        ('COF-001', '9400000000011', 'Flat White', 550),
        ('COF-002', '9400000000028', 'Long Black', 480),
        ('BAK-001', '9400000000035', 'Blueberry Muffin', 450),
        ('BAK-002', '9400000000042', 'Cheese Scone', 520),
        ('DRK-001', '9400000000059', 'Bottled Water 600ml', 300),
        ('DRK-002', '9400000000066', 'Orange Juice 350ml', 420);
    `
  },
  {
    version: 3,
    name: 'quick pick flag on products',
    up: `
      ALTER TABLE products ADD COLUMN quick_pick INTEGER NOT NULL DEFAULT 0;
    `
  }
]

export const LATEST_SCHEMA_VERSION = Math.max(...migrations.map((m) => m.version))
