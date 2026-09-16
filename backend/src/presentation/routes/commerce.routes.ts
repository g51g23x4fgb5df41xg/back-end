import { Router } from "express";
import type { CommerceUseCases } from "../../application/use-cases/commerce.use-cases.js";
import {
  addCartItemSchema,
  checkoutSchema,
  updateCartItemSchema,
} from "../validators/commerce.validators.js";
import { requireAuth, requireRole } from "../middlewares/access-auth.middleware.js";

export function createCommerceRouter(useCases: CommerceUseCases): Router {
  const router = Router();

  /** Sync variants for a product (Admin only) */
  router.post(
    "/products/:productId/variants/sync",
    requireAuth,
    requireRole("admin", "super_admin"),
    async (req, res) => {
      const productId = req.params.productId;
      if (!productId) {
        res.status(400).json({ success: false, error: { message: "معرف المنتج مطلوب" } });
        return;
      }
      try {
        const variantsList = Array.isArray(req.body) ? req.body : (req.body.variants || []);
        const result = await useCases.syncVariants(productId, variantsList);
        res.status(200).json({ success: true, ...result });
      } catch (error: any) {
        res.status(500).json({ success: false, error: { message: error.message } });
      }
    }
  );

  /** List variants for a product */
  router.get("/products/:productId/variants", async (req, res) => {
    try {
      const variants = await useCases.listVariants(req.params.productId);
      res.status(200).json({ success: true, data: variants });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  });

  /** Create variant */
  router.post("/products/:productId/variants", async (req, res) => {
    try {
      const variant = await useCases.createVariant({ ...req.body, productId: req.params.productId });
      res.status(201).json({ success: true, data: variant });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  });

  /** Update variant */
  router.put("/variants/:variantId", async (req, res) => {
    try {
      const variant = await useCases.updateVariant(req.params.variantId, req.body);
      if (!variant) {
        res.status(404).json({ success: false, error: { message: "النوع غير موجود" } });
        return;
      }
      res.status(200).json({ success: true, data: variant });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  });

  /** Delete variant */
  router.delete("/variants/:variantId", async (req, res) => {
    try {
      const deleted = await useCases.deleteVariant(req.params.variantId);
      res.status(200).json({ success: deleted });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  });

  /** Read current cart */
  router.get("/cart", async (req, res) => {
    const owner = resolveCartOwner(req);
    try {
      const cart = await useCases.getCart(owner);
      res.status(200).json({ success: true, data: cart });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  });

  /** Add item to cart */
  router.post("/cart/items", async (req, res) => {
    const parsed = addCartItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ success: false, error: parsed.error.issues });
      return;
    }
    const owner = resolveCartOwner(req);
    try {
      const cart = await useCases.addItem(owner, parsed.data.variantId, parsed.data.quantity);
      res.status(200).json({ success: true, data: cart });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  });

  /** Update item quantity */
  router.put("/cart/items/:itemId", async (req, res) => {
    const parsed = updateCartItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ success: false, error: parsed.error.issues });
      return;
    }
    const owner = resolveCartOwner(req);
    try {
      const cart = await useCases.updateItem(owner, req.params.itemId, parsed.data.quantity);
      res.status(200).json({ success: true, data: cart });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  });

  /** Remove item from cart */
  router.delete("/cart/items/:itemId", async (req, res) => {
    const owner = resolveCartOwner(req);
    try {
      await useCases.removeItem(owner, req.params.itemId);
      res.status(200).json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  });

  /** Checkout order: validated against real Supabase orders table */
  router.post("/orders/checkout", async (req, res) => {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message || "بيانات الطلب غير مكتملة",
          details: parsed.error.issues,
        },
      });
      return;
    }

    const owner = resolveCartOwner(req);
    try {
      const order = await useCases.checkout(owner, parsed.data);
      res.status(201).json({ success: true, data: order });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: "ORDER_CHECKOUT_FAILED", message: error.message || "تعذر إتمام الطلب" },
      });
    }
  });

  /** List orders */
  router.get("/orders", async (req, res) => {
    try {
      const userId = req.query.userId ? String(req.query.userId) : undefined;
      const orders = await useCases.listOrders(userId);
      res.status(200).json({ success: true, data: orders });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: { code: "ORDERS_FETCH_FAILED", message: error.message },
      });
    }
  });

  /** Get single order */
  router.get("/orders/:id", async (req, res) => {
    try {
      const order = await useCases.getOrderById(req.params.id);
      if (!order) {
        res.status(404).json({ success: false, error: { message: "الطلب غير موجود" } });
        return;
      }
      res.status(200).json({ success: true, data: order });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  });

  /** Update order status */
  router.put("/orders/:id/status", async (req, res) => {
    try {
      const status = req.body.status;
      if (!status) {
        res.status(400).json({ success: false, error: { message: "الحالة الجديدة مطلوبة" } });
        return;
      }
      const updated = await useCases.updateOrderStatus(req.params.id, status, req.body);
      if (!updated) {
        res.status(404).json({ success: false, error: { message: "الطلب غير موجود" } });
        return;
      }
      res.status(200).json({ success: true, data: updated });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  });

  /** Delete order */
  router.delete("/orders/:id", async (req, res) => {
    try {
      const deleted = await useCases.deleteOrder(req.params.id);
      res.status(200).json({ success: deleted });
    } catch (error: any) {
      res.status(500).json({ success: false, error: { message: error.message } });
    }
  });

  return router;
}

function resolveCartOwner(req: any): { userId?: string; sessionToken?: string } {
  const userId = req.user?.id;
  const sessionToken = req.headers["x-guest-session"] || req.cookies?.["reflect_guest_session"];
  return {
    userId: typeof userId === "string" ? userId : undefined,
    sessionToken: typeof sessionToken === "string" ? sessionToken : undefined,
  };
}
