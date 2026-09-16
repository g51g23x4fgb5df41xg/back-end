import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { OutOfStockError } from "../../domain/errors/commerce.errors.js";
import type {
  Cart,
  CartItem,
  CartOwner,
  CheckoutInput,
  CommerceRepository,
  Order,
  ProductVariant,
} from "../../domain/repositories/commerce.repository.js";

/** PostgreSQL implementation for orders, carts & stock adapted to real Supabase schema. */
export class PgCommerceRepository implements CommerceRepository {
  public constructor(private readonly pool: Pool) {}

  /** List all variants for a product if product_variants table exists. */
  public async listVariants(productId: string): Promise<ProductVariant[]> {
    try {
      const result = await this.pool.query(
        `SELECT id, product_id AS "productId", size, color, sku, price, stock_quantity AS "stockQuantity" 
         FROM product_variants 
         WHERE product_id::text = $1 
         ORDER BY id ASC`,
        [productId]
      );
      return result.rows as ProductVariant[];
    } catch {
      return [];
    }
  }

  public async createVariant(input: Record<string, unknown>): Promise<ProductVariant> {
    const result = await this.pool.query(
      `INSERT INTO product_variants (product_id, size, color, sku, price, stock_quantity) 
       VALUES ($1,$2,$3,$4,$5,$6) 
       RETURNING id, product_id AS "productId", size, color, sku, price, stock_quantity AS "stockQuantity"`,
      [
        input.productId,
        input.size,
        input.color,
        input.sku,
        input.price ?? null,
        input.stockQuantity ?? 0,
      ]
    );
    return result.rows[0] as ProductVariant;
  }

  public async updateVariant(id: string, input: Record<string, unknown>): Promise<ProductVariant | null> {
    const result = await this.pool.query(
      `UPDATE product_variants SET 
        size = COALESCE($2, size), 
        color = COALESCE($3, color), 
        sku = COALESCE($4, sku), 
        price = COALESCE($5, price), 
        stock_quantity = COALESCE($6, stock_quantity), 
        updated_at = now() 
       WHERE id::text = $1 
       RETURNING id, product_id AS "productId", size, color, sku, price, stock_quantity AS "stockQuantity"`,
      [id, input.size, input.color, input.sku, input.price, input.stockQuantity]
    );
    return (result.rows[0] as ProductVariant | undefined) ?? null;
  }

  public async deleteVariant(id: string): Promise<boolean> {
    try {
      const result = await this.pool.query(`DELETE FROM product_variants WHERE id::text = $1`, [id]);
      return (result.rowCount ?? 0) > 0;
    } catch {
      return false;
    }
  }

  public async syncVariants(
    productId: string | number,
    variants: Array<{ size: string; color: string; stock_quantity?: number; stockQuantity?: number; price?: number }>
  ): Promise<{ totalStock: number }> {
    const numericProductId = Number(productId);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM product_variants WHERE product_id::text = $1`, [String(numericProductId)]);

      let totalStock = 0;
      if (Array.isArray(variants) && variants.length > 0) {
        for (const v of variants) {
          const qty = Math.max(0, Math.floor(Number(v.stock_quantity ?? v.stockQuantity ?? 0)));
          totalStock += qty;
          const cleanSize = (v.size || "").trim();
          const cleanColor = (v.color || "").trim();
          const sku = `${numericProductId}-${cleanSize}-${cleanColor}`.replace(/\s+/g, "-");
          await client.query(
            `INSERT INTO product_variants (product_id, size, color, sku, price, stock_quantity)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [numericProductId, cleanSize, cleanColor, sku, v.price ?? null, qty]
          );
        }
      }

      await client.query(`UPDATE products SET stock = $1, updated_at = now() WHERE id = $2`, [
        totalStock,
        numericProductId,
      ]);

      await client.query("COMMIT");
      return { totalStock };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  public async getOrCreateCart(owner: CartOwner): Promise<Cart> {
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      const cartId = await this.ensureCart(client, owner);
      const cart = await this.readCart(client, cartId);
      await client.query("COMMIT");
      return cart;
    } catch {
      if (client) await client.query("ROLLBACK");
      return { id: randomUUID(), userId: owner.userId ?? null, sessionToken: owner.sessionToken ?? null, items: [] };
    } finally {
      client?.release();
    }
  }

  public async addCartItem(owner: CartOwner, variantId: string, quantity: number): Promise<Cart> {
    if (!variantId || String(variantId).trim().length === 0) {
      throw new Error("VARIANT_ID_REQUIRED");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cartId = await this.ensureCart(client, owner);
      await client.query(
        `INSERT INTO cart_items (cart_id, variant_id, quantity) 
         VALUES ($1,$2,$3) 
         ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity`,
        [cartId, variantId, quantity]
      );
      const cart = await this.readCart(client, cartId);
      await client.query("COMMIT");
      return cart;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async updateCartItem(owner: CartOwner, itemId: string, quantity: number): Promise<Cart> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cartId = await this.ensureCart(client, owner);
      if (quantity <= 0) {
        await client.query(`DELETE FROM cart_items WHERE id::text = $1 AND cart_id::text = $2`, [itemId, cartId]);
      } else {
        await client.query(`UPDATE cart_items SET quantity = $1 WHERE id::text = $2 AND cart_id::text = $3`, [
          quantity,
          itemId,
          cartId,
        ]);
      }
      const cart = await this.readCart(client, cartId);
      await client.query("COMMIT");
      return cart;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async removeCartItem(owner: CartOwner, itemId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cartId = await this.ensureCart(client, owner);
      await client.query(`DELETE FROM cart_items WHERE id::text = $1 AND cart_id::text = $2`, [itemId, cartId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Checkout:
   * 1. Resolves each cart item to its variant_id
   * 2. Atomically decrements product_variants.stock_quantity with strict stock-sufficiency check:
   *    UPDATE product_variants SET stock_quantity = stock_quantity - $qty WHERE id = $variantId AND stock_quantity >= $qty RETURNING id
   * 3. Throws OutOfStockError and rolls back entire transaction if rowCount is 0
   * 4. Creates order record in Supabase orders table
   */
  public async checkout(owner: CartOwner, input: CheckoutInput): Promise<Order> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      let items = Array.isArray(input.cartItems) && input.cartItems.length > 0 ? input.cartItems : [];
      if (items.length === 0 && (owner.userId || owner.sessionToken)) {
        try {
          const cartId = await this.ensureCart(client, owner);
          const persistedCart = await this.readCart(client, cartId);
          if (persistedCart.items.length > 0) {
            items = persistedCart.items;
          }
        } catch {
          // ignore fallback
        }
      }

      if (items.length === 0) {
        throw new Error("CART_EMPTY");
      }

      // Step 1: Resolve each cart item to its variant_id
      // Step 2 & 3: Atomically deduct stock from product_variants with sufficient stock check
      for (const item of items) {
        const qty = Math.max(1, Math.floor(Number(item.quantity || item.qty || 1)));

        let variantId: number | string | null = null;
        let productId: number | string | null = null;

        // 1a. Check if explicit variantId / variant_id is provided
        const explicitVariantId = item.variantId ?? item.variant_id;
        if (explicitVariantId !== undefined && explicitVariantId !== null && String(explicitVariantId).trim() !== "") {
          const varCheck = await client.query(
            `SELECT id, product_id, stock_quantity FROM product_variants WHERE id::text = $1 LIMIT 1`,
            [String(explicitVariantId)]
          );
          if (varCheck.rows[0]) {
            variantId = varCheck.rows[0].id;
            productId = varCheck.rows[0].product_id;
          }
        }

        // 1b. If not resolved yet, resolve via product ID + size + color
        if (!variantId) {
          const targetProdId = item.productId ?? item.product_id ?? item.id;
          const targetSize = (item.selectedSize || item.size || "").trim();
          const targetColor = (item.selectedColor || item.color || "").trim();

          if (targetProdId !== undefined && targetProdId !== null && String(targetProdId).trim() !== "") {
            // Match by product_id AND size AND color (case-insensitive)
            if (targetSize && targetColor) {
              const matchRes = await client.query(
                `SELECT id, product_id, stock_quantity 
                 FROM product_variants 
                 WHERE (product_id::text = $1 OR id::text = $1)
                   AND LOWER(TRIM(size)) = LOWER(TRIM($2)) 
                   AND LOWER(TRIM(color)) = LOWER(TRIM($3))
                 LIMIT 1`,
                [String(targetProdId), targetSize, targetColor]
              );
              if (matchRes.rows[0]) {
                variantId = matchRes.rows[0].id;
                productId = matchRes.rows[0].product_id;
              }
            }

            // Match by product_id AND size if color omitted
            if (!variantId && targetSize) {
              const matchSizeRes = await client.query(
                `SELECT id, product_id, stock_quantity 
                 FROM product_variants 
                 WHERE (product_id::text = $1 OR id::text = $1)
                   AND LOWER(TRIM(size)) = LOWER(TRIM($2))
                 ORDER BY id ASC 
                 LIMIT 1`,
                [String(targetProdId), targetSize]
              );
              if (matchSizeRes.rows[0]) {
                variantId = matchSizeRes.rows[0].id;
                productId = matchSizeRes.rows[0].product_id;
              }
            }

            // Match by product_id AND color if size omitted
            if (!variantId && targetColor) {
              const matchColorRes = await client.query(
                `SELECT id, product_id, stock_quantity 
                 FROM product_variants 
                 WHERE (product_id::text = $1 OR id::text = $1)
                   AND LOWER(TRIM(color)) = LOWER(TRIM($2))
                 ORDER BY id ASC 
                 LIMIT 1`,
                [String(targetProdId), targetColor]
              );
              if (matchColorRes.rows[0]) {
                variantId = matchColorRes.rows[0].id;
                productId = matchColorRes.rows[0].product_id;
              }
            }

            // Check if targetProdId is itself directly a variant ID
            if (!variantId) {
              const directVarRes = await client.query(
                `SELECT id, product_id, stock_quantity FROM product_variants WHERE id::text = $1 LIMIT 1`,
                [String(targetProdId)]
              );
              if (directVarRes.rows[0]) {
                variantId = directVarRes.rows[0].id;
                productId = directVarRes.rows[0].product_id;
              }
            }

            // Check if product has any existing variant
            if (!variantId) {
              const anyVarRes = await client.query(
                `SELECT id, product_id, stock_quantity 
                 FROM product_variants 
                 WHERE product_id::text = $1 
                 ORDER BY id ASC 
                 LIMIT 1`,
                [String(targetProdId)]
              );
              if (anyVarRes.rows[0]) {
                variantId = anyVarRes.rows[0].id;
                productId = anyVarRes.rows[0].product_id;
              }
            }

            // If product exists in products table but has NO variants in product_variants yet,
            // bootstrap a default variant matching the product's current stock
            if (!variantId) {
              const prodRes = await client.query(
                `SELECT id, title, stock, price FROM products WHERE id::text = $1 LIMIT 1`,
                [String(targetProdId)]
              );
              if (prodRes.rows[0]) {
                const p = prodRes.rows[0];
                const cleanSize = targetSize || "Standard";
                const cleanColor = targetColor || "Default";
                const sku = `${p.id}-${cleanSize}-${cleanColor}`.replace(/\s+/g, "-");
                const initialStock = Math.max(0, Number(p.stock) || 0);
                const insVar = await client.query(
                  `INSERT INTO product_variants (product_id, size, color, sku, price, stock_quantity)
                   VALUES ($1, $2, $3, $4, $5, $6)
                   ON CONFLICT (product_id, size, color) DO UPDATE SET updated_at = now()
                   RETURNING id, product_id, stock_quantity`,
                  [p.id, cleanSize, cleanColor, sku, p.price ?? null, initialStock]
                );
                if (insVar.rows[0]) {
                  variantId = insVar.rows[0].id;
                  productId = insVar.rows[0].product_id;
                }
              }
            }
          }
        }

        // If variant could not be resolved at all, abort and roll back transaction
        if (!variantId) {
          const identifier = item.title || item.name || item.id || "unknown";
          throw new OutOfStockError(
            String(identifier),
            `تعذر تحديد متغير المنتج المطلوب (${identifier}) / Could not resolve variant for product ${identifier}`
          );
        }

        // Attach resolved variant ID and product ID to item snapshot
        item.variantId = String(variantId);
        item.variant_id = Number(variantId);
        if (productId) {
          item.productId = String(productId);
          item.product_id = Number(productId);
        }

        // Step 2 & 3: Atomic decrement with sufficient-stock check
        const numVariantId = !isNaN(Number(variantId)) ? Number(variantId) : variantId;
        const res = await client.query(
          `UPDATE product_variants 
             SET stock_quantity = stock_quantity - $1, updated_at = now() 
           WHERE id = $2 AND stock_quantity >= $1 
           RETURNING id`,
          [qty, numVariantId]
        );

        if (!res.rowCount || res.rowCount === 0) {
          throw new OutOfStockError(variantId);
        }

        // Keep products.stock synchronized as a cached sum
        if (productId) {
          await client.query(
            `UPDATE products 
             SET stock = (
               SELECT COALESCE(SUM(stock_quantity), 0) 
               FROM product_variants 
               WHERE product_id = $1
             ),
             updated_at = now() 
             WHERE id = $1`,
            [productId]
          );
        }
      }

      // Calculate totals
      const shippingFee = Number(input.shippingFee || 0);
      let calculatedSubtotal = 0;
      for (const it of items) {
        const p = Number(it.price || it.unitPrice || 0);
        const q = Number(it.quantity || it.qty || 1);
        calculatedSubtotal += p * q;
      }
      const totalPrice = input.totalPrice !== undefined ? Number(input.totalPrice) : calculatedSubtotal + shippingFee;

      const paymentMethod = input.paymentMethod || "cod";
      const paymentStatus =
        input.paymentStatus ||
        (paymentMethod === "baridimob" ? "pending_verification" : paymentMethod === "cod" ? "pending" : "pending_payment");

      // Insert into Supabase orders table with real columns
      const insertQuery = `
        INSERT INTO orders (
          full_name,
          phone_number,
          address,
          wilaya,
          commune,
          delivery_type,
          delivery_provider,
          shipping_fee,
          cart_items,
          total_price,
          payment_method,
          payment_status,
          status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *
      `;

      const values = [
        input.fullName,
        input.phoneNumber,
        input.address,
        input.wilaya || null,
        input.commune || null,
        input.deliveryType || "home",
        input.deliveryProvider || "yalidine",
        shippingFee,
        JSON.stringify(items),
        totalPrice,
        paymentMethod,
        paymentStatus,
        "pending",
      ];

      const orderResult = await client.query(insertQuery, values);
      const row = orderResult.rows[0];

      // Clear cart items for owner if order placed successfully
      if (owner.userId || owner.sessionToken) {
        try {
          const column = owner.userId ? "user_id" : "session_token";
          const val = owner.userId ?? owner.sessionToken;
          await client.query(
            `DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE ${column}::text = $1)`,
            [val]
          );
        } catch {
          // ignore
        }
      }

      await client.query("COMMIT");

      return this.mapRowToOrder(row);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /** List orders from Supabase orders table. */
  public async listOrders(userId?: string): Promise<Order[]> {
    let query = `SELECT * FROM orders ORDER BY created_at DESC`;
    const values: any[] = [];
    if (userId) {
      query = `SELECT * FROM orders WHERE user_id::text = $1 ORDER BY created_at DESC`;
      values.push(userId);
    }
    const result = await this.pool.query(query, values);
    return result.rows.map((row) => this.mapRowToOrder(row));
  }

  /** Find order by id. */
  public async getOrderById(orderId: string | number): Promise<Order | null> {
    const isNum = !isNaN(Number(orderId));
    const result = await this.pool.query(
      `SELECT * FROM orders WHERE ${isNum ? "id = $1" : "id::text = $1"} LIMIT 1`,
      [isNum ? Number(orderId) : String(orderId)]
    );
    if (!result.rows[0]) return null;
    return this.mapRowToOrder(result.rows[0]);
  }

  /** Update order status. */
  public async updateOrderStatus(
    orderId: string | number,
    status: string,
    extra?: Record<string, unknown>
  ): Promise<Order | null> {
    const isNum = !isNaN(Number(orderId));
    const targetId = isNum ? Number(orderId) : String(orderId);

    const paymentStatus = extra?.payment_status || extra?.paymentStatus || null;
    const trackingNumber = extra?.tracking_number || extra?.trackingNumber || null;
    const chargilyInvoiceId = extra?.chargily_invoice_id || extra?.chargilyInvoiceId || null;
    const receiptUrl = extra?.receipt_url || extra?.receiptUrl || null;

    const result = await this.pool.query(
      `UPDATE orders SET 
        status = COALESCE($2, status),
        payment_status = COALESCE($3, payment_status),
        tracking_number = COALESCE($4, tracking_number),
        chargily_invoice_id = COALESCE($5, chargily_invoice_id),
        receipt_url = COALESCE($6, receipt_url)
       WHERE ${isNum ? "id = $1" : "id::text = $1"} 
       RETURNING *`,
      [targetId, status, paymentStatus, trackingNumber, chargilyInvoiceId, receiptUrl]
    );

    if (!result.rows[0]) return null;
    return this.mapRowToOrder(result.rows[0]);
  }

  /** Delete order from orders table. */
  public async deleteOrder(orderId: string | number): Promise<boolean> {
    const isNum = !isNaN(Number(orderId));
    const result = await this.pool.query(
      `DELETE FROM orders WHERE ${isNum ? "id = $1" : "id::text = $1"}`,
      [isNum ? Number(orderId) : String(orderId)]
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async ensureCart(client: PoolClient, owner: CartOwner): Promise<string> {
    if (!owner.userId && !owner.sessionToken) throw new Error("CART_OWNER_REQUIRED");
    await this.ensureCartItemsConstraints(client);
    const column = owner.userId ? "user_id" : "session_token";
    const value = owner.userId ?? owner.sessionToken;
    const existing = await client.query(`SELECT id FROM carts WHERE ${column}::text = $1 LIMIT 1`, [value]);
    if (existing.rows[0]) return String(existing.rows[0].id);
    const created = await client.query(`INSERT INTO carts (${column}) VALUES ($1) RETURNING id`, [value]);
    return String(created.rows[0].id);
  }

  /** Ensures cart_items.variant_id NOT NULL and foreign key constraint exist (Issue #11). */
  private async ensureCartItemsConstraints(client: PoolClient): Promise<void> {
    try {
      await client.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'cart_items' AND column_name = 'variant_id' AND is_nullable = 'YES'
          ) THEN
            DELETE FROM cart_items WHERE variant_id IS NULL;
            ALTER TABLE cart_items ALTER COLUMN variant_id SET NOT NULL;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'cart_items_variant_fk' AND table_name = 'cart_items'
          ) AND EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'product_variants'
          ) THEN
            ALTER TABLE cart_items ADD CONSTRAINT cart_items_variant_fk 
              FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END $$;
      `);
    } catch {
      // Safe fallback if schema modification is restricted
    }
  }

  private async readCart(client: PoolClient, cartId: string): Promise<Cart> {
    const cartResult = await client.query(`SELECT id, user_id AS "userId", session_token AS "sessionToken" FROM carts WHERE id::text = $1`, [cartId]);
    const items = await client.query(`SELECT ci.id, ci.variant_id AS "variantId", ci.quantity FROM cart_items ci WHERE ci.cart_id::text = $1`, [cartId]);
    return {
      id: String(cartResult.rows[0]?.id || cartId),
      userId: cartResult.rows[0]?.userId ? String(cartResult.rows[0].userId) : null,
      sessionToken: cartResult.rows[0]?.sessionToken || null,
      items: items.rows.map((it) => ({ id: String(it.id), variantId: String(it.variantId), quantity: Number(it.quantity) })),
    };
  }

  private mapRowToOrder(row: any): Order {
    let parsedCartItems: any[] = [];
    if (Array.isArray(row.cart_items)) {
      parsedCartItems = row.cart_items;
    } else if (typeof row.cart_items === "string") {
      try {
        parsedCartItems = JSON.parse(row.cart_items);
      } catch {
        parsedCartItems = [];
      }
    }

    return {
      id: row.id,
      orderNumber: row.order_number || `RF-${row.id}`,
      userId: row.user_id ? String(row.user_id) : null,
      fullName: row.full_name || "",
      phoneNumber: row.phone_number || "",
      address: row.address || "",
      wilaya: row.wilaya || null,
      commune: row.commune || null,
      deliveryType: row.delivery_type || "home",
      deliveryProvider: row.delivery_provider || "yalidine",
      shippingFee: Number(row.shipping_fee || 0),
      cartItems: parsedCartItems,
      totalPrice: Number(row.total_price || 0),
      subtotal: Number(row.subtotal || row.total_price || 0),
      paymentMethod: row.payment_method || "cod",
      paymentStatus: row.payment_status || "pending",
      status: row.status || "pending",
      trackingNumber: row.tracking_number || null,
      chargilyInvoiceId: row.chargily_invoice_id || null,
      receiptUrl: row.receipt_url || null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    };
  }
}
