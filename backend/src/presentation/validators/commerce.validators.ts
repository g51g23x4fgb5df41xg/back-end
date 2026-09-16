import { z } from "zod";

/** Validate order checkout inputs based on real Supabase orders schema. */
export const checkoutSchema = z.object({
  fullName: z.string().trim().min(2, "الاسم الكامل مطلوب"),
  phoneNumber: z.string().trim().min(8, "رقم الهاتف غير صحيح"),
  address: z.string().trim().min(3, "العنوان مطلوب بالتفصيل"),
  wilaya: z.string().trim().nullish().transform((val) => val || undefined),
  commune: z.string().trim().nullish().transform((val) => val || undefined),
  deliveryType: z.enum(["home", "desk"]).default("home"),
  deliveryProvider: z.string().default("yalidine"),
  shippingFee: z.coerce.number().nonnegative().default(0),
  paymentMethod: z.enum(["cod", "baridimob", "cib"]).default("cod"),
  paymentStatus: z.string().optional(),
  cartItems: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]).optional(),
        title: z.string().optional(),
        name: z.string().optional(),
        price: z.coerce.number(),
        quantity: z.coerce.number().int().min(1),
        selectedSize: z.string().optional(),
        selectedColor: z.string().optional(),
        size: z.string().optional(),
        color: z.string().optional(),
        image: z.string().optional(),
        imageUrl: z.string().optional(),
      })
    )
    .min(1, "سلة التسوق فارغة"),
  totalPrice: z.coerce.number().nonnegative().optional(),
  trackingNumber: z.string().optional(),
  chargilyInvoiceId: z.string().optional(),
  receiptUrl: z.string().optional(),
});

/** Validate adding items to cart. */
export const addCartItemSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(20),
});

/** Validate quantity adjustments. */
export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(0).max(20),
});
