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
  },
  {
    version: 10,
    name: 'marketing mailers',
    up: `
      CREATE TABLE marketing_campaigns (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        subject    TEXT NOT NULL DEFAULT '',
        message    TEXT NOT NULL DEFAULT '',
        flyer      TEXT,                          -- data: URL of the flyer image
        audience   TEXT NOT NULL DEFAULT '{}',    -- JSON (rules, time window, customer types)
        status     TEXT NOT NULL DEFAULT 'draft', -- draft | sending | sent | cancelled
        last_error TEXT,                          -- e.g. mail server login failed (sending pauses)
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        sent_at    TEXT
      );
      -- One row per recipient once a mailer is sent (the email address is kept as it was)
      CREATE TABLE marketing_sends (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id INTEGER NOT NULL REFERENCES marketing_campaigns(id),
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        email       TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'pending', -- pending | sent | failed
        error       TEXT,
        sent_at     TEXT,
        UNIQUE (campaign_id, customer_id)
      );
      CREATE INDEX idx_marketing_sends_status ON marketing_sends(campaign_id, status);
      INSERT INTO settings (key, value) VALUES ('store_address', '') ON CONFLICT(key) DO NOTHING;
    `
  },
  {
    version: 11,
    name: 'work orders and customer units',
    up: `
      -- Equipment a customer owns (bought here with a serial number, or added for a repair)
      CREATE TABLE customer_units (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id   INTEGER NOT NULL REFERENCES customers(id),
        category      TEXT NOT NULL DEFAULT 'other',   -- handheld | mower | other
        unit_type     TEXT NOT NULL DEFAULT '',
        brand         TEXT NOT NULL DEFAULT '',
        model         TEXT NOT NULL DEFAULT '',
        serial        TEXT NOT NULL DEFAULT '',
        hours         REAL,                            -- mower hour meter (optional)
        purchased_here INTEGER NOT NULL DEFAULT 0,
        purchase_date TEXT,
        sale_id       INTEGER REFERENCES sales(id),
        notes         TEXT NOT NULL DEFAULT '',
        active        INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_units_customer ON customer_units(customer_id);
      CREATE INDEX idx_units_serial ON customer_units(serial);

      -- Serial number of a serialized item sold
      ALTER TABLE sale_items ADD COLUMN serial TEXT;

      CREATE TABLE work_orders (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id     INTEGER NOT NULL REFERENCES customers(id),
        unit_id         INTEGER NOT NULL REFERENCES customer_units(id),
        status          TEXT NOT NULL DEFAULT 'needs_estimate',
        problem         TEXT NOT NULL DEFAULT '',
        diagnosis       TEXT NOT NULL DEFAULT '',
        work_done       TEXT NOT NULL DEFAULT '',
        internal_notes  TEXT NOT NULL DEFAULT '',
        hours_in        REAL,
        last_emailed_at TEXT,
        last_emailed_status TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_wo_status ON work_orders(status);
      CREATE INDEX idx_wo_customer ON work_orders(customer_id);

      CREATE TABLE work_order_lines (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        work_order_id    INTEGER NOT NULL REFERENCES work_orders(id),
        kind             TEXT NOT NULL,          -- part | labor | shop | misc
        product_id       INTEGER REFERENCES products(id),
        description      TEXT NOT NULL,
        qty              REAL NOT NULL DEFAULT 1, -- hours for labor
        unit_price_cents INTEGER NOT NULL DEFAULT 0,
        taxable          INTEGER NOT NULL DEFAULT 1,
        stock_taken      REAL NOT NULL DEFAULT 0  -- parts taken out of stock for this ticket
      );
      CREATE INDEX idx_wo_lines ON work_order_lines(work_order_id);

      CREATE TABLE work_order_history (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        work_order_id INTEGER NOT NULL REFERENCES work_orders(id),
        at            TEXT NOT NULL DEFAULT (datetime('now')),
        status        TEXT,
        note          TEXT NOT NULL,
        by_name       TEXT NOT NULL DEFAULT ''
      );
    `
  },
  {
    version: 12,
    name: 'estimate fees and paying for work orders at the till',
    up: `
      ALTER TABLE work_orders ADD COLUMN fee_cents INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE work_orders ADD COLUMN fee_status TEXT NOT NULL DEFAULT 'none'; -- none | unpaid | paid | applied | kept
      ALTER TABLE work_orders ADD COLUMN fee_sale_id INTEGER REFERENCES sales(id);
      ALTER TABLE work_orders ADD COLUMN fee_applied_sale_id INTEGER REFERENCES sales(id);
      ALTER TABLE work_orders ADD COLUMN sale_id INTEGER REFERENCES sales(id);  -- pick-up receipt
      ALTER TABLE sales ADD COLUMN work_order_id INTEGER REFERENCES work_orders(id);
    `
  },
  {
    version: 13,
    name: 'returns and refunds',
    up: `
      -- What each receipt line is: item = normal sale, wo = work order line, credit = estimate fee credit,
      -- return = an item coming back (negative qty, linked to the original receipt line when there was one),
      -- feekept = part of a refund not given back because the receipt had an estimate fee credit
      ALTER TABLE sale_items ADD COLUMN kind TEXT NOT NULL DEFAULT 'item';
      ALTER TABLE sale_items ADD COLUMN return_of_item_id INTEGER REFERENCES sale_items(id);
      ALTER TABLE sale_items ADD COLUMN return_of_sale_id INTEGER REFERENCES sales(id);
      ALTER TABLE sale_items ADD COLUMN return_reason TEXT;
      ALTER TABLE sale_items ADD COLUMN restocked INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sale_items ADD COLUMN tax_cents INTEGER; -- tax included in a return line (negative)
      CREATE INDEX idx_sale_items_return_of ON sale_items(return_of_item_id);

      -- Older sales: mark work order / fee credit lines so they can't be returned at the till
      UPDATE sale_items SET kind = 'credit' WHERE product_id IS NULL AND line_total_cents < 0;
      UPDATE sale_items SET kind = 'wo'
        WHERE kind = 'item' AND (
          sale_id IN (SELECT sale_id FROM work_orders WHERE sale_id IS NOT NULL)
          OR (department IN ('Service Labor', 'Shop Supplies', 'Service Other', 'Estimate Fees')
              AND sale_id IN (SELECT id FROM sales WHERE work_order_id IS NOT NULL))
        );

      -- A return made without the original receipt (manager to check later)
      ALTER TABLE sales ADD COLUMN no_receipt_return INTEGER NOT NULL DEFAULT 0;
    `
  },
  {
    version: 14,
    name: 'feedback (enhancement requests and problems)',
    up: `
      CREATE TABLE feedback (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        kind        TEXT NOT NULL DEFAULT 'idea',     -- idea | problem | question
        subject     TEXT NOT NULL,
        message     TEXT NOT NULL,
        name        TEXT NOT NULL DEFAULT '',
        reply_email TEXT NOT NULL DEFAULT '',
        till_name   TEXT NOT NULL DEFAULT '',
        app_version TEXT NOT NULL DEFAULT '',
        screen      TEXT NOT NULL DEFAULT '',
        status      TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | failed
        error       TEXT,
        sent_to     TEXT,
        sent_at     TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `
  },
  {
    version: 15,
    name: 'check payments',
    up: `
      -- The payments table only allowed cash and card. SQLite can't change that rule in place,
      -- so the table is copied into a new one that also allows 'check' (same columns, same data).
      CREATE TABLE payments_new (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id      INTEGER NOT NULL REFERENCES sales(id),
        method       TEXT NOT NULL CHECK (method IN ('cash', 'card', 'check')),
        amount_cents INTEGER NOT NULL,
        reference    TEXT
      );
      INSERT INTO payments_new (id, sale_id, method, amount_cents, reference)
        SELECT id, sale_id, method, amount_cents, reference FROM payments;
      DROP TABLE payments;
      ALTER TABLE payments_new RENAME TO payments;
      CREATE INDEX idx_payments_sale ON payments(sale_id);
    `
  },
  {
    version: 16,
    name: 'held receipts',
    up: `
      -- A sale built ahead of time and put on hold (e.g. a part was ordered) until the customer comes to pay
      CREATE TABLE held_sales (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER REFERENCES customers(id),
        note        TEXT NOT NULL DEFAULT '',
        items_json  TEXT NOT NULL,            -- [{ productId, qty, serial }]
        tax_exempt  INTEGER NOT NULL DEFAULT 0,
        till_name   TEXT NOT NULL DEFAULT '',
        status      TEXT NOT NULL DEFAULT 'held',   -- held | completed | deleted
        sale_id     INTEGER REFERENCES sales(id),
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_held_status ON held_sales(status);
    `
  },
  {
    version: 17,
    name: 'sales tax added at checkout, multiple tax rates',
    up: `
      -- How each sale was taxed: older sales had tax-inclusive prices; from v0.3.16 tax is added at checkout
      ALTER TABLE sales ADD COLUMN tax_mode TEXT NOT NULL DEFAULT 'inclusive';
      ALTER TABLE sales ADD COLUMN tax_rate REAL;
      ALTER TABLE sales ADD COLUMN tax_rate_id TEXT;
      ALTER TABLE sales ADD COLUMN tax_rate_name TEXT;
      -- Older sales: remember the store rate they were taxed at
      UPDATE sales SET tax_rate = (SELECT CAST(value AS REAL) FROM settings WHERE key = 'tax_rate') WHERE tax_rate IS NULL;
    `
  },
  {
    version: 18,
    name: 'customer past due balance and custom field (QuickBooks POS import)',
    up: `
      ALTER TABLE customers ADD COLUMN past_due_cents INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE customers ADD COLUMN custom_field1 TEXT;
    `
  }
]

export const LATEST_SCHEMA_VERSION = Math.max(...migrations.map((m) => m.version))
