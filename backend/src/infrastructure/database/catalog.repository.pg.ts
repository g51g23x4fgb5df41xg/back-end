import type { Pool } from "pg";
import type {
  CatalogRepository,
  Category,
  CursorPage,
  Product,
  ProductFilters,
} from "../../domain/repositories/catalog.repository.js";

/** PostgreSQL repository for products & categories adapted to the real Supabase schema. */
export class PgCatalogRepository implements CatalogRepository {
  public constructor(private readonly pool: Pool) {}

  /** Read a product page using id as the stable keyset cursor. */
  public async listProducts(filters: ProductFilters): Promise<CursorPage<Product>> {
    const values: unknown[] = [];
    const where: string[] = ["(is_active IS NULL OR is_active = true)"];

    if (filters.cursor) {
      const cursorId = Number.parseInt(
        Buffer.from(filters.cursor, "base64url").toString("utf8"),
        10
      );
      if (!isNaN(cursorId)) {
        values.push(cursorId);
        where.push(`id < $${values.length}`);
      }
    }

    if (filters.category && filters.category !== "ALL") {
      values.push(filters.category.toUpperCase().trim());
      where.push(`UPPER(category) = $${values.length}`);
    }

    if (filters.subcategory) {
      values.push(filters.subcategory.toUpperCase().trim());
      where.push(`UPPER(COALESCE(subcategory, '')) = $${values.length}`);
    }

    if (filters.search) {
      values.push(`%${filters.search.trim()}%`);
      where.push(`(COALESCE(title, name, '') ILIKE $${values.length} OR COALESCE(description, '') ILIKE $${values.length})`);
    }

    const limit = Math.min(filters.limit || 20, 100);
    values.push(limit + 1);

    const query = `
      SELECT 
        id, 
        COALESCE(title, name, 'Reflect Item') AS title,
        COALESCE(slug, id::text) AS slug,
        description,
        COALESCE(category, 'MEN') AS category,
        subcategory,
        price,
        COALESCE(cost_price, 0) AS "costPrice",
        COALESCE(discount_percentage, 0) AS "discountPercentage",
        COALESCE(image_url, '') AS "imageUrl",
        COALESCE(frame_url, '') AS "frameUrl",
        images,
        available_sizes AS "availableSizes",
        available_colors AS "availableColors",
        COALESCE(stock, 10) AS stock,
        COALESCE(import_source, 'manual') AS "importSource",
        COALESCE(is_active, true) AS "isActive",
        COALESCE(is_published, true) AS "isPublished",
        COALESCE(status, 'active') AS status,
        COALESCE(rating_avg, 0) AS "ratingAvg",
        COALESCE(rating_count, 0) AS "ratingCount",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM products 
      WHERE ${where.join(" AND ")} 
      ORDER BY id DESC 
      LIMIT $${values.length}
    `;

    const result = await this.pool.query(query, values);
    const mapped = result.rows.map((row) => this.mapRowToProduct(row));

    const items = mapped.slice(0, limit);
    const hasMore = mapped.length > limit;
    const last = items.at(-1);

    return {
      items,
      hasMore,
      nextCursor: hasMore && last ? Buffer.from(String(last.id), "utf8").toString("base64url") : null,
    };
  }

  /** Find one product by slug. */
  public async findProductBySlug(slug: string): Promise<Product | null> {
    const result = await this.pool.query(
      `SELECT 
        id, 
        COALESCE(title, name, 'Reflect Item') AS title,
        COALESCE(slug, id::text) AS slug,
        description,
        COALESCE(category, 'MEN') AS category,
        subcategory,
        price,
        COALESCE(cost_price, 0) AS "costPrice",
        COALESCE(discount_percentage, 0) AS "discountPercentage",
        COALESCE(image_url, '') AS "imageUrl",
        COALESCE(frame_url, '') AS "frameUrl",
        images,
        available_sizes AS "availableSizes",
        available_colors AS "availableColors",
        COALESCE(stock, 10) AS stock,
        COALESCE(import_source, 'manual') AS "importSource",
        COALESCE(is_active, true) AS "isActive",
        COALESCE(is_published, true) AS "isPublished",
        COALESCE(status, 'active') AS status,
        COALESCE(rating_avg, 0) AS "ratingAvg",
        COALESCE(rating_count, 0) AS "ratingCount",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
       FROM products 
       WHERE slug = $1 
       LIMIT 1`,
      [slug]
    );

    if (!result.rows[0]) return null;
    return this.mapRowToProduct(result.rows[0]);
  }

  /** Find one product by its numeric or UUID id. */
  public async findProductById(id: string | number): Promise<Product | null> {
    const isNum = !isNaN(Number(id));
    const result = await this.pool.query(
      `SELECT 
        id, 
        COALESCE(title, name, 'Reflect Item') AS title,
        COALESCE(slug, id::text) AS slug,
        description,
        COALESCE(category, 'MEN') AS category,
        subcategory,
        price,
        COALESCE(cost_price, 0) AS "costPrice",
        COALESCE(discount_percentage, 0) AS "discountPercentage",
        COALESCE(image_url, '') AS "imageUrl",
        COALESCE(frame_url, '') AS "frameUrl",
        images,
        available_sizes AS "availableSizes",
        available_colors AS "availableColors",
        COALESCE(stock, 10) AS stock,
        COALESCE(import_source, 'manual') AS "importSource",
        COALESCE(is_active, true) AS "isActive",
        COALESCE(is_published, true) AS "isPublished",
        COALESCE(status, 'active') AS status,
        COALESCE(rating_avg, 0) AS "ratingAvg",
        COALESCE(rating_count, 0) AS "ratingCount",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
       FROM products 
       WHERE ${isNum ? "id = $1" : "id::text = $1"} 
       LIMIT 1`,
      [isNum ? Number(id) : String(id)]
    );

    if (!result.rows[0]) return null;
    return this.mapRowToProduct(result.rows[0]);
  }

  /** Insert a product into Supabase products table. */
  public async createProduct(input: Record<string, unknown>): Promise<Product> {
    const title = String(input.title || input.name || "New Product");
    const slug = String(input.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now());
    const category = String(input.category || "MEN").toUpperCase();
    const price = Number(input.price || 0);
    const stock = Number(input.stock ?? 10);
    const costPrice = Number(input.costPrice || input.cost_price || 0);
    const discount = Number(input.discountPercentage || input.discount_percentage || 0);
    const imageUrl = (input.imageUrl || input.image_url || input.image || null) as string | null;
    const frameUrl = (input.frameUrl || input.frame_url || null) as string | null;
    const images = Array.isArray(input.images) ? input.images : imageUrl ? [imageUrl] : [];
    const sizes = Array.isArray(input.availableSizes || input.available_sizes || input.sizes)
      ? (input.availableSizes || input.available_sizes || input.sizes)
      : ["S", "M", "L", "XL"];
    const colors = Array.isArray(input.availableColors || input.available_colors || input.colors)
      ? (input.availableColors || input.available_colors || input.colors)
      : ["Black", "White"];
    const importSource = String(input.importSource || input.import_source || "manual");
    const isActive = input.isActive !== undefined ? Boolean(input.isActive) : true;
    const isPublished = input.isPublished !== undefined ? Boolean(input.isPublished) : true;
    const status = String(input.status || "active");

    const result = await this.pool.query(
      `INSERT INTO products (
        title, slug, description, category, subcategory, price, cost_price, 
        discount_percentage, image_url, frame_url, images, available_sizes, 
        available_colors, stock, import_source, is_active, is_published, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) 
      RETURNING 
        id, 
        COALESCE(title, name, 'Reflect Item') AS title,
        COALESCE(slug, id::text) AS slug,
        description,
        category,
        subcategory,
        price,
        cost_price AS "costPrice",
        discount_percentage AS "discountPercentage",
        image_url AS "imageUrl",
        frame_url AS "frameUrl",
        images,
        available_sizes AS "availableSizes",
        available_colors AS "availableColors",
        stock,
        import_source AS "importSource",
        is_active AS "isActive",
        is_published AS "isPublished",
        status,
        0 AS "ratingAvg",
        0 AS "ratingCount",
        created_at AS "createdAt",
        updated_at AS "updatedAt"`,
      [
        title,
        slug,
        input.description ?? null,
        category,
        input.subcategory ?? input.product_type ?? null,
        price,
        costPrice,
        discount,
        imageUrl,
        frameUrl,
        JSON.stringify(images),
        JSON.stringify(sizes),
        JSON.stringify(colors),
        stock,
        importSource,
        isActive,
        isPublished,
        status,
      ]
    );

    return this.mapRowToProduct(result.rows[0]);
  }

  /** Update a product by id. */
  public async updateProduct(id: string | number, input: Record<string, unknown>): Promise<Product | null> {
    const isNum = !isNaN(Number(id));
    const targetId = isNum ? Number(id) : String(id);

    const result = await this.pool.query(
      `UPDATE products SET 
        title = COALESCE($2, title),
        slug = COALESCE($3, slug),
        description = COALESCE($4, description),
        category = COALESCE($5, category),
        subcategory = COALESCE($6, subcategory),
        price = COALESCE($7, price),
        cost_price = COALESCE($8, cost_price),
        discount_percentage = COALESCE($9, discount_percentage),
        image_url = COALESCE($10, image_url),
        frame_url = COALESCE($11, frame_url),
        images = COALESCE($12, images),
        available_sizes = COALESCE($13, available_sizes),
        available_colors = COALESCE($14, available_colors),
        stock = COALESCE($15, stock),
        is_active = COALESCE($16, is_active),
        is_published = COALESCE($17, is_published),
        status = COALESCE($18, status),
        updated_at = now() 
      WHERE ${isNum ? "id = $1" : "id::text = $1"} 
      RETURNING 
        id, 
        COALESCE(title, name, 'Reflect Item') AS title,
        COALESCE(slug, id::text) AS slug,
        description,
        category,
        subcategory,
        price,
        cost_price AS "costPrice",
        discount_percentage AS "discountPercentage",
        image_url AS "imageUrl",
        frame_url AS "frameUrl",
        images,
        available_sizes AS "availableSizes",
        available_colors AS "availableColors",
        stock,
        import_source AS "importSource",
        is_active AS "isActive",
        is_published AS "isPublished",
        status,
        COALESCE(rating_avg, 0) AS "ratingAvg",
        COALESCE(rating_count, 0) AS "ratingCount",
        created_at AS "createdAt",
        updated_at AS "updatedAt"`,
      [
        targetId,
        input.title || input.name || null,
        input.slug || null,
        input.description || null,
        input.category ? String(input.category).toUpperCase() : null,
        input.subcategory || input.product_type || null,
        input.price !== undefined ? Number(input.price) : null,
        input.costPrice !== undefined ? Number(input.costPrice) : input.cost_price !== undefined ? Number(input.cost_price) : null,
        input.discountPercentage !== undefined ? Number(input.discountPercentage) : input.discount_percentage !== undefined ? Number(input.discount_percentage) : null,
        input.imageUrl || input.image_url || null,
        input.frameUrl !== undefined ? input.frameUrl : input.frame_url !== undefined ? input.frame_url : null,
        input.images ? JSON.stringify(input.images) : null,
        input.availableSizes ? JSON.stringify(input.availableSizes) : input.available_sizes ? JSON.stringify(input.available_sizes) : null,
        input.availableColors ? JSON.stringify(input.availableColors) : input.available_colors ? JSON.stringify(input.available_colors) : null,
        input.stock !== undefined ? Number(input.stock) : null,
        input.isActive !== undefined ? Boolean(input.isActive) : null,
        input.isPublished !== undefined ? Boolean(input.isPublished) : null,
        input.status || null,
      ]
    );

    if (!result.rows[0]) return null;
    return this.mapRowToProduct(result.rows[0]);
  }

  /** Delete a product. */
  public async deleteProduct(id: string | number): Promise<boolean> {
    const isNum = !isNaN(Number(id));
    const result = await this.pool.query(
      `DELETE FROM products WHERE ${isNum ? "id = $1" : "id::text = $1"}`,
      [isNum ? Number(id) : String(id)]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** List categories ordered for storefront display. */
  public async listCategories(): Promise<Category[]> {
    const result = await this.pool.query(
      `SELECT id, name, subtitle, image_url AS "imageUrl", category_code AS "categoryCode", display_order AS "displayOrder", bg 
       FROM categories 
       ORDER BY display_order ASC, id ASC`
    );
    return result.rows as Category[];
  }

  /** Insert a category. */
  public async createCategory(input: Record<string, unknown>): Promise<Category> {
    const result = await this.pool.query(
      `INSERT INTO categories (name, subtitle, image_url, category_code, display_order, bg) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, name, subtitle, image_url AS "imageUrl", category_code AS "categoryCode", display_order AS "displayOrder", bg`,
      [
        input.name,
        input.subtitle ?? null,
        input.imageUrl ?? input.image_url ?? null,
        input.categoryCode ?? input.category_code ?? "ALL",
        input.displayOrder ?? input.display_order ?? 0,
        input.bg ?? null,
      ]
    );
    return result.rows[0] as Category;
  }

  /** Update a category by id. */
  public async updateCategory(id: number, input: Record<string, unknown>): Promise<Category | null> {
    const result = await this.pool.query(
      `UPDATE categories SET 
        name = COALESCE($2, name),
        subtitle = COALESCE($3, subtitle),
        image_url = COALESCE($4, image_url),
        category_code = COALESCE($5, category_code),
        display_order = COALESCE($6, display_order),
        bg = COALESCE($7, bg) 
       WHERE id = $1 
       RETURNING id, name, subtitle, image_url AS "imageUrl", category_code AS "categoryCode", display_order AS "displayOrder", bg`,
      [
        id,
        input.name,
        input.subtitle,
        input.imageUrl ?? input.image_url,
        input.categoryCode ?? input.category_code,
        input.displayOrder ?? input.display_order,
        input.bg,
      ]
    );
    return (result.rows[0] as Category | undefined) ?? null;
  }

  /** Delete a category by id. */
  public async deleteCategory(id: number): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM categories WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  private mapRowToProduct(row: any): Product {
    let parsedImages: any[] = [];
    if (Array.isArray(row.images)) {
      parsedImages = row.images;
    } else if (typeof row.images === "string") {
      try {
        parsedImages = JSON.parse(row.images);
      } catch {
        parsedImages = row.images.split(",").map((s: string) => s.trim());
      }
    }
    if (parsedImages.length === 0 && row.imageUrl) {
      parsedImages = [row.imageUrl];
    }

    let parsedSizes: string[] = [];
    if (Array.isArray(row.availableSizes)) {
      parsedSizes = row.availableSizes;
    } else if (typeof row.availableSizes === "string") {
      try {
        parsedSizes = JSON.parse(row.availableSizes);
      } catch {
        parsedSizes = row.availableSizes.split(",").map((s: string) => s.trim());
      }
    }

    let parsedColors: string[] = [];
    if (Array.isArray(row.availableColors)) {
      parsedColors = row.availableColors;
    } else if (typeof row.availableColors === "string") {
      try {
        parsedColors = JSON.parse(row.availableColors);
      } catch {
        parsedColors = row.availableColors.split(",").map((s: string) => s.trim());
      }
    }

    return {
      id: row.id,
      title: row.title,
      name: row.title,
      slug: row.slug,
      description: row.description,
      category: row.category,
      subcategory: row.subcategory,
      productType: row.subcategory,
      price: Number(row.price || 0),
      costPrice: Number(row.costPrice || 0),
      discountPercentage: Number(row.discountPercentage || 0),
      imageUrl: row.imageUrl,
      frameUrl: row.frameUrl || "",
      images: parsedImages,
      availableSizes: parsedSizes,
      availableColors: parsedColors,
      stock: Number(row.stock || 0),
      importSource: row.importSource || "manual",
      isActive: Boolean(row.isActive),
      isPublished: Boolean(row.isPublished),
      status: row.status || "active",
      ratingAvg: Number(row.ratingAvg || 0),
      ratingCount: Number(row.ratingCount || 0),
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
    };
  }
}
