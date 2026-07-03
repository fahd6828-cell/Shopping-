-- ============================================================================
--  Souqly — Shopping Assistant for the Arab Market
--  PostgreSQL Schema (Phase 1)
--
--  Design notes
--  ------------
--  * Normalized to 3NF. A "product" is a canonical item (e.g. iPhone 16
--    256GB); the same product sold on several stores is represented by one
--    row per store in `product_listings`. Prices over time live in
--    `price_history`, keyed by listing (product+store), never by product
--    alone — two stores for the same product have independent histories.
--  * Money is NUMERIC(12,2) — never floats. Every money column carries an
--    explicit ISO-4217 currency code because the region mixes SAR/AED/KWD/EGP.
--  * Country codes are ISO-3166-1 alpha-2 (SA, AE, KW, EG, ...).
--  * `shipping_rates` powers the "final price" feature: total displayed to
--    the user = listing price + shipping to the user's country (zeroed when
--    the order clears the store's free-shipping threshold).
--  * Timestamps are TIMESTAMPTZ; the app layer treats everything as UTC.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive email

-- ----------------------------------------------------------------------------
-- ENUM types
-- ----------------------------------------------------------------------------
CREATE TYPE discount_type AS ENUM ('percent', 'fixed', 'free_shipping');
CREATE TYPE language_code AS ENUM ('ar', 'en');

-- ----------------------------------------------------------------------------
-- users — app accounts (mobile + extension sign-in)
-- Anonymous flow: the mobile app registers a device_id (client-generated
-- UUID) with a push token, no email/password; a real account can be
-- attached later. Every user has at least one identity (see CHECK).
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    email              CITEXT        UNIQUE,
    phone              VARCHAR(20),                       -- E.164, e.g. +9665xxxxxxx
    password_hash      TEXT,                              -- bcrypt/argon2, never plaintext
    device_id          UUID          UNIQUE,              -- anonymous device identity
    display_name       VARCHAR(100)  NOT NULL DEFAULT 'ضيف',
    country_code       CHAR(2)       NOT NULL DEFAULT 'SA',
    preferred_language language_code NOT NULL DEFAULT 'ar',
    push_token         TEXT,                              -- FCM/APNs token for price alerts
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),

    CONSTRAINT users_identity_check CHECK (email IS NOT NULL OR device_id IS NOT NULL)
);

-- ----------------------------------------------------------------------------
-- stores — supported e-commerce stores (Amazon SA/AE, Noon, Namshi, ...)
-- ----------------------------------------------------------------------------
CREATE TABLE stores (
    id            SERIAL        PRIMARY KEY,
    slug          VARCHAR(50)   NOT NULL UNIQUE,          -- 'amazon-sa', 'noon', ...
    name          VARCHAR(100)  NOT NULL,                 -- "Amazon Saudi Arabia"
    name_ar       VARCHAR(100)  NOT NULL,                 -- "أمازون السعودية"
    website_url   TEXT          NOT NULL,
    url_pattern   TEXT          NOT NULL,                 -- regex the browser extension uses
                                                          -- to detect the store, e.g. '^https://(www\.)?amazon\.sa/'
    country_code  CHAR(2)       NOT NULL,                 -- store's home market
    currency      CHAR(3)       NOT NULL,                 -- store's listing currency (SAR, AED, ...)
    affiliate_tag TEXT,                                   -- appended to outbound links
    logo_url      TEXT,
    is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- products — canonical product identity, store-independent
-- ----------------------------------------------------------------------------
CREATE TABLE products (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name VARCHAR(255) NOT NULL,                 -- "Apple iPhone 16 128GB"
    name_ar        VARCHAR(255),                          -- "آيفون 16 - 128 جيجابايت"
    brand          VARCHAR(100),
    category       VARCHAR(100),                          -- flat for now; move to a table when taxonomy grows
    model_number   VARCHAR(100),                          -- manufacturer part number, aids cross-store matching
    barcode        VARCHAR(50),                           -- EAN/UPC when known — strongest matching key
    image_url      TEXT,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Trigram-friendly search on name (requires pg_trgm for ILIKE speedups later);
-- plain btree index is enough for exact/prefix lookups now.
CREATE INDEX idx_products_canonical_name ON products (canonical_name);
CREATE INDEX idx_products_barcode ON products (barcode) WHERE barcode IS NOT NULL;

-- ----------------------------------------------------------------------------
-- product_listings — one product as sold by one store (the join entity)
-- ----------------------------------------------------------------------------
CREATE TABLE product_listings (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id        UUID          NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    store_id          INTEGER       NOT NULL REFERENCES stores (id)   ON DELETE CASCADE,
    store_product_url TEXT          NOT NULL,             -- deep link to the product page
    store_sku         VARCHAR(100),                       -- ASIN / Noon SKU, for scraper re-checks
    current_price     NUMERIC(12,2) NOT NULL CHECK (current_price >= 0),
    currency          CHAR(3)       NOT NULL,
    in_stock          BOOLEAN       NOT NULL DEFAULT TRUE,
    last_checked_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),

    UNIQUE (product_id, store_id)                         -- one listing per product per store
);

CREATE INDEX idx_listings_store   ON product_listings (store_id);
CREATE INDEX idx_listings_product ON product_listings (product_id);
-- Scraper work queue: "which listings are stale?"
CREATE INDEX idx_listings_last_checked ON product_listings (last_checked_at);

-- ----------------------------------------------------------------------------
-- price_history — append-only price snapshots per listing
-- ----------------------------------------------------------------------------
CREATE TABLE price_history (
    id          BIGSERIAL     PRIMARY KEY,
    listing_id  UUID          NOT NULL REFERENCES product_listings (id) ON DELETE CASCADE,
    price       NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    currency    CHAR(3)       NOT NULL,
    in_stock    BOOLEAN       NOT NULL DEFAULT TRUE,
    recorded_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Serves both the price-drop alert job ("latest two points per listing")
-- and the mobile app's price sparkline (range scan, newest first).
CREATE INDEX idx_price_history_listing_time ON price_history (listing_id, recorded_at DESC);

-- ----------------------------------------------------------------------------
-- coupons — discount codes per store, with crowd-sourced validation counters
-- ----------------------------------------------------------------------------
CREATE TABLE coupons (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id         INTEGER       NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
    code             VARCHAR(50)   NOT NULL,
    description_ar   TEXT          NOT NULL,              -- "خصم 10% على الإلكترونيات"
    description_en   TEXT,
    discount_type    discount_type NOT NULL,
    discount_value   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
                                                          -- percent: 0-100; fixed: amount in store currency;
                                                          -- free_shipping: ignored (0)
    min_order_value  NUMERIC(12,2),                       -- NULL = no minimum
    valid_from       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    valid_until      TIMESTAMPTZ   NOT NULL,
    is_verified      BOOLEAN       NOT NULL DEFAULT FALSE,-- staff/auto-tested at least once
    success_count    INTEGER       NOT NULL DEFAULT 0,    -- users reported "worked"
    fail_count       INTEGER       NOT NULL DEFAULT 0,    -- users reported "didn't work"
    last_verified_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),

    UNIQUE (store_id, code),
    CHECK (valid_until > valid_from),
    CHECK (discount_type <> 'percent' OR discount_value <= 100)
);

-- The hot query: "active verified coupons for store X". Partial index keeps
-- it tiny no matter how many expired codes accumulate.
CREATE INDEX idx_coupons_active
    ON coupons (store_id, valid_until)
    WHERE is_verified = TRUE;

-- ----------------------------------------------------------------------------
-- tracked_products — a user watching a listing for a price drop
-- ----------------------------------------------------------------------------
CREATE TABLE tracked_products (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID          NOT NULL REFERENCES users (id)            ON DELETE CASCADE,
    listing_id   UUID          NOT NULL REFERENCES product_listings (id) ON DELETE CASCADE,
    target_price NUMERIC(12,2) CHECK (target_price IS NULL OR target_price > 0),
                                                          -- NULL = notify on any drop
    price_at_save NUMERIC(12,2) NOT NULL,                 -- baseline shown as "was X when you saved it"
    notified_at  TIMESTAMPTZ,                             -- last push sent, throttles duplicate alerts
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),

    UNIQUE (user_id, listing_id)
);

-- Alert job scans by listing when a new price lands.
CREATE INDEX idx_tracked_listing ON tracked_products (listing_id);

-- ----------------------------------------------------------------------------
-- shipping_rates — estimated shipping per store per destination country
-- ----------------------------------------------------------------------------
CREATE TABLE shipping_rates (
    id                       SERIAL        PRIMARY KEY,
    store_id                 INTEGER       NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
    destination_country      CHAR(2)       NOT NULL,
    base_cost                NUMERIC(12,2) NOT NULL CHECK (base_cost >= 0),
    currency                 CHAR(3)       NOT NULL,
    free_shipping_threshold  NUMERIC(12,2),               -- NULL = never free
    est_days_min             SMALLINT      NOT NULL DEFAULT 1,
    est_days_max             SMALLINT      NOT NULL DEFAULT 7,
    updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),

    UNIQUE (store_id, destination_country),
    CHECK (est_days_max >= est_days_min)
);

-- ----------------------------------------------------------------------------
-- updated_at maintenance
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at    BEFORE UPDATE ON users    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
