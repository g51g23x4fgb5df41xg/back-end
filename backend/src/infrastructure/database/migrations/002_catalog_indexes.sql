-- =============================================================================
-- 002_catalog_indexes.sql — Indexes for Products and Categories
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_products_catalog_cursor ON products (id DESC) WHERE is_active = true AND is_published = true;
CREATE INDEX IF NOT EXISTS idx_products_category_cursor ON products (category, id DESC) WHERE is_active = true AND is_published = true;
CREATE INDEX IF NOT EXISTS idx_products_subcategory_cursor ON products (subcategory, id DESC) WHERE is_active = true AND is_published = true;
CREATE INDEX IF NOT EXISTS idx_categories_display_order ON categories (display_order ASC, id ASC);

-- Trigram index for fast product title search (if pg_trgm extension available)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS idx_products_title_trgm ON products USING gin (title gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm extension could not be enabled, skipping trigram index';
END $$;
