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
  },
  {
    version: 4,
    name: 'full item details (inventory item form)',
    up: `
      ALTER TABLE products ADD COLUMN type TEXT NOT NULL DEFAULT 'inventory';
      ALTER TABLE products ADD COLUMN department TEXT;
      ALTER TABLE products ADD COLUMN description TEXT;
      ALTER TABLE products ADD COLUMN size TEXT;
      ALTER TABLE products ADD COLUMN attribute TEXT;
      ALTER TABLE products ADD COLUMN cost_cents INTEGER;
      ALTER TABLE products ADD COLUMN on_hand INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE products ADD COLUMN taxable INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE products ADD COLUMN quick_pick_group TEXT;
      ALTER TABLE products ADD COLUMN vendor TEXT;
      ALTER TABLE products ADD COLUMN order_cost_cents INTEGER;
      ALTER TABLE products ADD COLUMN reorder_point INTEGER;
      ALTER TABLE products ADD COLUMN alu TEXT;
      ALTER TABLE products ADD COLUMN unit_of_measure TEXT;
      ALTER TABLE products ADD COLUMN manufacturer TEXT;
      ALTER TABLE products ADD COLUMN print_tags INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE products ADD COLUMN unorderable INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE products ADD COLUMN use_serial INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE products ADD COLUMN earn_commission INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE products ADD COLUMN earn_rewards INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE products ADD COLUMN ship_weight REAL;
      ALTER TABLE products ADD COLUMN ship_height REAL;
      ALTER TABLE products ADD COLUMN ship_length REAL;
      ALTER TABLE products ADD COLUMN ship_width REAL;
      ALTER TABLE products ADD COLUMN comments TEXT;
      CREATE INDEX idx_products_alu ON products(alu);
    `
  },
  {
    version: 5,
    name: 'customers, and a customer on each sale',
    up: `
      CREATE TABLE customers (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name          TEXT,
        last_name           TEXT,
        title               TEXT,
        company             TEXT,
        track_as_company    INTEGER NOT NULL DEFAULT 0,
        phone               TEXT,
        mobile              TEXT,
        email               TEXT,
        ok_to_email         INTEGER NOT NULL DEFAULT 0,
        street              TEXT,
        street2             TEXT,
        city                TEXT,
        region              TEXT,
        postcode            TEXT,
        customer_no         TEXT UNIQUE,
        alt_phone           TEXT,
        alt_contact         TEXT,
        customer_type       TEXT,
        tax_exempt          INTEGER NOT NULL DEFAULT 0,
        discount_pct        REAL,
        accept_cheques      INTEGER NOT NULL DEFAULT 0,
        ship_same_as_billing INTEGER NOT NULL DEFAULT 1,
        ship_street         TEXT,
        ship_street2        TEXT,
        ship_city           TEXT,
        ship_region         TEXT,
        ship_postcode       TEXT,
        notes               TEXT,
        active              INTEGER NOT NULL DEFAULT 1,
        created_at          TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_customers_last_name ON customers(last_name);
      CREATE INDEX idx_customers_company ON customers(company);
      CREATE INDEX idx_customers_phone ON customers(phone);

      ALTER TABLE sales ADD COLUMN customer_id INTEGER REFERENCES customers(id);
      CREATE INDEX idx_sales_customer ON sales(customer_id);
    `
  },
  {
    version: 6,
    name: 'customer kiosks (iPad)',
    up: `
      CREATE TABLE kiosks (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        till_name  TEXT NOT NULL,
        token      TEXT NOT NULL UNIQUE,
        paired_at  TEXT NOT NULL DEFAULT (datetime('now')),
        active     INTEGER NOT NULL DEFAULT 1
      );
      INSERT INTO settings (key, value) VALUES
        ('kiosk_welcome', 'Welcome! We''ll be with you in a moment.')
        ON CONFLICT(key) DO NOTHING;
    `
  },
  {
    version: 7,
    name: 'tax-exempt ID and card copied flag on customers',
    up: `
      ALTER TABLE customers ADD COLUMN tax_exempt_id TEXT;
      ALTER TABLE customers ADD COLUMN tax_exempt_card_copied INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE customers ADD COLUMN tax_exempt_expires TEXT; -- YYYY-MM-DD
    `
  },
  {
    version: 8,
    name: 'tax-exempt sales',
    up: `
      ALTER TABLE sales ADD COLUMN tax_exempt INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sales ADD COLUMN tax_exempt_id TEXT;              -- Farm Tax ID used (kept for audits)
      ALTER TABLE sales ADD COLUMN tax_exempt_cents INTEGER NOT NULL DEFAULT 0; -- tax removed
    `
  },
  {
    version: 9,
    name: 'QuickBooks daily summary export',
    up: `
      -- Snapshot of each sold item's department and taxability, so past daily
      -- summaries don't change if an item is edited later
      ALTER TABLE sale_items ADD COLUMN department TEXT;
      ALTER TABLE sale_items ADD COLUMN taxable INTEGER;
      UPDATE sale_items SET
        department = (SELECT department FROM products p WHERE p.id = sale_items.product_id),
        taxable    = COALESCE((SELECT taxable FROM products p WHERE p.id = sale_items.product_id), 1);

      -- One row per day + payment method sent (or to be sent) to QuickBooks
      CREATE TABLE qb_exports (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_date   TEXT NOT NULL,             -- YYYY-MM-DD (store local time)
        method      TEXT NOT NULL,             -- cash | card
        ref_number  TEXT NOT NULL UNIQUE,      -- e.g. POS261105C (Sales Receipt No. in QuickBooks)
        total_cents INTEGER NOT NULL,
        sale_count  INTEGER NOT NULL,
        status      TEXT NOT NULL DEFAULT 'pending', -- pending | sent | error
        txn_id      TEXT,
        error       TEXT,
        attempts    INTEGER NOT NULL DEFAULT 0,
        sent_at     TEXT,
        updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (sale_date, method)
      );

      CREATE TABLE qb_log (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        at      TEXT NOT NULL DEFAULT (datetime('now')),
        level   TEXT NOT NULL,                 -- info | warn | error
        message TEXT NOT NULL
      );
    `
  }
]

export const LATEST_SCHEMA_VERSION = Math.max(...migrations.map((m) => m.version))
