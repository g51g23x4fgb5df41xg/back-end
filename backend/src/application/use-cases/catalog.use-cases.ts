import type { CatalogRepository, Category, CursorPage, Product, ProductFilters } from "../../domain/repositories/catalog.repository.js";
import { CatalogCacheService } from "../../infrastructure/services/catalog-cache.service.js";

/** Coordinates cache-first catalog reads and cache invalidation after writes. */
export class CatalogUseCases {
  public constructor(
    private readonly repository: CatalogRepository,
    private readonly cache: CatalogCacheService
  ) {}

  /** Read products from Redis first, then PostgreSQL, and cache misses for 60 seconds. */
  public async listProducts(filters: ProductFilters): Promise<CursorPage<Product>> {
    const key = this.cache.listKey(filters);
    const cached = await this.cache.getProductPage(key);
    if (cached) return cached;
    const page = await this.repository.listProducts(filters);
    await this.cache.setProductPage(key, page);
    return page;
  }

  /** Read a product detail from Redis first, then PostgreSQL, and cache misses for five minutes. */
  public async getProduct(identifier: string): Promise<Product | null> {
    const cached = await this.cache.getProduct(identifier);
    if (cached) return cached;
    let product = await this.repository.findProductBySlug(identifier);
    if (!product && (!isNaN(Number(identifier)) || identifier.length > 5)) {
      product = await this.repository.findProductById(identifier);
    }
    if (product) await this.cache.setProduct(identifier, product);
    return product;
  }

  /** Create a product and immediately invalidate all catalog caches. */
  public async createProduct(input: Record<string, unknown>): Promise<Product> {
    const product = await this.repository.createProduct(input);
    await this.cache.invalidateCatalog();
    return product;
  }

  /** Bulk create products and invalidate catalog caches once. */
  public async createProductsBulk(items: Array<Record<string, unknown>>): Promise<Product[]> {
    const created: Product[] = [];
    for (const item of items) {
      const prod = await this.repository.createProduct(item);
      created.push(prod);
    }
    await this.cache.invalidateCatalog();
    return created;
  }

  /** Update a product and invalidate list plus old/new detail cache entries. */
  public async updateProduct(id: string | number, input: Record<string, unknown>): Promise<Product | null> {
    const product = await this.repository.updateProduct(id, input);
    if (product) await this.cache.invalidateCatalog(product.slug);
    return product;
  }

  /** Soft-delete a product and invalidate catalog caches. */
  public async deleteProduct(id: string | number): Promise<boolean> {
    const deleted = await this.repository.deleteProduct(id);
    await this.cache.invalidateCatalog();
    return deleted;
  }

  /** Read categories from Redis first, then PostgreSQL, and cache misses for ten minutes. */
  public async listCategories(): Promise<Category[]> {
    const cached = await this.cache.getCategories();
    if (cached) return cached;
    const categories = await this.repository.listCategories();
    await this.cache.setCategories(categories);
    return categories;
  }

  /** Create a category and invalidate category and product listing caches. */
  public async createCategory(input: Record<string, unknown>): Promise<Category> {
    const category = await this.repository.createCategory(input);
    await this.cache.invalidateCatalog();
    return category;
  }

  /** Update a category and invalidate category and product listing caches. */
  public async updateCategory(id: number, input: Record<string, unknown>): Promise<Category | null> {
    const category = await this.repository.updateCategory(id, input);
    if (category) await this.cache.invalidateCatalog();
    return category;
  }

  /** Delete a category and invalidate catalog caches. */
  public async deleteCategory(id: number): Promise<boolean> {
    const deleted = await this.repository.deleteCategory(id);
    if (deleted) await this.cache.invalidateCatalog();
    return deleted;
  }
}
