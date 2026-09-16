-- =============================================================================
-- 003_variants_cart_orders.sql — Variants, Carts & Orders compatibility
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Product Variants table (optional normalized variants)
CREATE TABLE IF NOT EXISTS product_variants (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size VARCHAR(20) NOT NULL,
  color VARCHAR(40) NOT NULL,
  sku VARCHAR(80) UNIQUE NOT NULL,
  price NUMERIC(10,2),
  stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, size, color)
);

CREATE INDEX IF NOT EXISTS idx_variants_product_id ON product_variants(product_id, id);
CREATE INDEX IF NOT EXISTS idx_variants_sku ON product_variants(sku);

-- 2. Carts & Cart Items
CREATE TABLE IF NOT EXISTS carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT carts_owner_check CHECK (user_id IS NOT NULL OR session_token IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_carts_user_unique ON carts(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_carts_session_unique ON carts(session_token) WHERE session_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS cart_items (
  id BIGSERIAL PRIMARY KEY,
  cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id BIGINT,
  quantity INT NOT NULL CHECK (quantity > 0),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Ensure orders table has all modern columns
DO $$
BEGIN
  -- Check if orders table exists, if not create it
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
    CREATE TABLE orders (
      id BIGSERIAL PRIMARY KEY,
      order_number VARCHAR(32),
      user_id UUID REFERENCES users(id),
      full_name VARCHAR(150) NOT NULL,
      phone_number VARCHAR(20) NOT NULL,
      address TEXT NOT NULL,
      wilaya VARCHAR(60),
      commune VARCHAR(100),
      delivery_type VARCHAR(10) NOT NULL DEFAULT 'home',
      delivery_provider VARCHAR(20) NOT NULL DEFAULT 'yalidine',
      shipping_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
      cart_items JSONB NOT NULL DEFAULT '[]',
      subtotal NUMERIC(10,2),
      total_price NUMERIC(10,2) NOT NULL,
      payment_method VARCHAR(20) NOT NULL,
      payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      tracking_number VARCHAR(80),
      chargily_invoice_id VARCHAR(100),
      receipt_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;
