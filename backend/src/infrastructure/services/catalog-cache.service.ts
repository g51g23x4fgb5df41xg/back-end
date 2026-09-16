import { createHash } from "node:crypto";
import { redisClient } from "../config/redis.config.js";
import type { Category, CursorPage, Product, ProductFilters } from "../../domain/repositories/catalog.repository.js";

const LIST_TTL_SECONDS = 60;
const PRODUCT_TTL_SECONDS = 300;
const CATEGORY_TTL_SECONDS = 600;

/** Redis cache adapter for hot catalog reads and write invalidation. */
export class CatalogCacheService {
  /** Build a deterministic cache key from public filters. */
  public listKey(filters: ProductFilters): string {
    const digest = createHash("sha256").update(JSON.stringify(filters)).digest("hex");
    return `products:list:${digest}`;
  }

  /** Read a cached product page, returning null on a miss or when Redis is offline. */
  public async getProductPage(key: string): Promise<CursorPage<Product> | null> {
    try {
      if (redisClient.status !== "ready") return null;
      const value = await redisClient.get(key);
      if (!value) return null;
      return JSON.parse(value) as CursorPage<Product>;
    } catch {
      return null;
    }
  }

  /** Cache a product page with a one-minute TTL. */
  public async setProductPage(key: string, value: CursorPage<Product>): Promise<void> {
    try {
      if (redisClient.status !== "ready") return;
      await redisClient.set(key, JSON.stringify(value), "EX", LIST_TTL_SECONDS);
    } catch {
      // ignore cache write errors
    }
  }

  /** Read a product detail cache entry. */
  public async getProduct(slug: string): Promise<Product | null> {
    try {
      if (redisClient.status !== "ready") return null;
      const value = await redisClient.get(`product:${slug}`);
      return value ? (JSON.parse(value) as Product) : null;
    } catch {
      return null;
    }
  }

  /** Cache a product detail for five minutes. */
  public async setProduct(slug: string, value: Product): Promise<void> {
    try {
      if (redisClient.status !== "ready") return;
      await redisClient.set(`product:${slug}`, JSON.stringify(value), "EX", PRODUCT_TTL_SECONDS);
    } catch {
      // ignore
    }
  }

  /** Read the cached category list. */
  public async getCategories(): Promise<Category[] | null> {
    try {
      if (redisClient.status !== "ready") return null;
      const value = await redisClient.get("categories:list");
      return value ? (JSON.parse(value) as Category[]) : null;
    } catch {
      return null;
    }
  }

  /** Cache categories for ten minutes. */
  public async setCategories(value: Category[]): Promise<void> {
    try {
      if (redisClient.status !== "ready") return;
      await redisClient.set("categories:list", JSON.stringify(value), "EX", CATEGORY_TTL_SECONDS);
    } catch {
      // ignore
    }
  }

  /** Invalidate all product list/detail keys and category data after catalog writes. */
  public async invalidateCatalog(slug?: string): Promise<void> {
    try {
      if (redisClient.status !== "ready") return;
      let cursor = "0";
      do {
        const result = await redisClient.scan(cursor, "MATCH", "products:list:*", "COUNT", 100);
        cursor = result[0];
        const keys = result[1];
        if (keys && keys.length) await redisClient.del(...keys);
      } while (cursor !== "0");
      if (slug) await redisClient.del(`product:${slug}`);
      await redisClient.del("categories:list");
    } catch {
      // ignore
    }
  }
}
