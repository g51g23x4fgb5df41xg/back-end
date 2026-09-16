import { Router } from "express";
import type { CatalogUseCases } from "../../application/use-cases/catalog.use-cases.js";
import {
  createCategorySchema,
  createProductSchema,
  listProductsSchema,
  updateCategorySchema,
  updateProductSchema,
} from "../validators/catalog.validators.js";
import { requireAuth, requireRole } from "../middlewares/access-auth.middleware.js";

export function createCatalogRouter(useCases: CatalogUseCases): Router {
  const router = Router();

  /** Public cursor-paginated product listing */
  router.get("/products", async (req, res) => {
    const parsed = listProductsSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.flatten() });
      return;
    }

    try {
      const page = await useCases.listProducts(parsed.data);
      res.status(200).json({
        success: true,
        data: page.items,
        pagination: {
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: "CATALOG_ERROR", message: error.message || "فشل جلب المنتجات" },
      });
    }
  });

  /** Public single product detail */
  router.get("/products/:idOrSlug", async (req, res) => {
    try {
      const product = await useCases.getProduct(req.params.idOrSlug);
      if (!product) {
        res.status(404).json({
          success: false,
          error: { code: "PRODUCT_NOT_FOUND", message: "المنتج غير موجود" },
        });
        return;
      }
      res.status(200).json({ success: true, data: product });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: "SERVER_ERROR", message: error.message },
      });
    }
  });

  /** Create a product */
  router.post("/products", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ success: false, error: parsed.error.issues });
      return;
    }

    try {
      const product = await useCases.createProduct(parsed.data);
      res.status(201).json({ success: true, data: product });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: "PRODUCT_CREATE_FAILED", message: error.message },
      });
    }
  });

  /** Bulk create products */
  router.post("/products/bulk", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    const rawList = Array.isArray(req.body) ? req.body : (req.body.products || []);
    if (!Array.isArray(rawList)) {
      res.status(400).json({ success: false, error: { message: "Invalid payload, array expected" } });
      return;
    }

    try {
      const validated: Record<string, unknown>[] = [];
      for (const item of rawList) {
        const parsed = createProductSchema.safeParse(item);
        if (parsed.success) {
          validated.push(parsed.data);
        } else {
          // Lenient fallback for bulk imports: use item directly if it has title/price/category
          if (item && (item.title || item.name) && item.price !== undefined) {
            validated.push(item);
          }
        }
      }
      const products = await useCases.createProductsBulk(validated);
      res.status(201).json({ success: true, count: products.length, data: products });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: "BULK_CREATE_FAILED", message: error.message },
      });
    }
  });

  /** Update a product */
  router.put("/products/:id", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ success: false, error: { message: "معرف المنتج مطلوب" } });
      return;
    }

    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ success: false, error: parsed.error.issues });
      return;
    }

    try {
      const product = await useCases.updateProduct(id, parsed.data);
      if (!product) {
        res.status(404).json({ success: false, error: { message: "المنتج غير موجود" } });
        return;
      }
      res.status(200).json({ success: true, data: product });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  });

  /** Delete a product */
  router.delete("/products/:id", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ success: false, error: { message: "معرف المنتج مطلوب" } });
      return;
    }

    try {
      const deleted = await useCases.deleteProduct(id);
      res.status(200).json({ success: deleted });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  });

  /** Public list categories */
  router.get("/categories", async (_req, res) => {
    try {
      const categories = await useCases.listCategories();
      res.status(200).json({ success: true, data: categories });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: "CATEGORIES_ERROR", message: error.message || "فشل جلب الفئات" },
      });
    }
  });

  /** Create category */
  router.post("/categories", async (req, res) => {
    const parsed = createCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ success: false, error: parsed.error.issues });
      return;
    }

    try {
      const category = await useCases.createCategory(parsed.data);
      res.status(201).json({ success: true, data: category });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  });

  /** Update category */
  router.put("/categories/:id", async (req, res) => {
    const parsed = updateCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ success: false, error: parsed.error.issues });
      return;
    }

    try {
      const category = await useCases.updateCategory(Number(req.params.id), parsed.data);
      if (!category) {
        res.status(404).json({ success: false, error: { message: "الفئة غير موجودة" } });
        return;
      }
      res.status(200).json({ success: true, data: category });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  });

  /** Delete category */
  router.delete("/categories/:id", async (req, res) => {
    try {
      const deleted = await useCases.deleteCategory(Number(req.params.id));
      res.status(200).json({ success: deleted });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  });

  return router;
}
