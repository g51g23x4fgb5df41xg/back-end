import { z } from "zod";

/** Validate product creation payloads. */
export const createProductSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  name: z.string().trim().min(1).max(255).optional(),
  slug: z.string().max(280).optional(),
  description: z.string().max(10000).optional().nullable(),
  category: z.string().trim().min(1).max(50),
  subcategory: z.string().max(100).optional().nullable(),
  product_type: z.string().max(100).optional().nullable(),
  price: z.coerce.number().nonnegative(),
  costPrice: z.coerce.number().nonnegative().optional(),
  cost_price: z.coerce.number().nonnegative().optional(),
  discountPercentage: z.coerce.number().int().min(0).max(100).optional(),
  discount_percentage: z.coerce.number().int().min(0).max(100).optional(),
  imageUrl: z.string().max(2048).optional().nullable(),
  image_url: z.string().max(2048).optional().nullable(),
  image: z.string().max(2048).optional().nullable(),
  frameUrl: z.string().max(2048).optional().nullable(),
  frame_url: z.string().max(2048).optional().nullable(),
  images: z.array(z.string()).max(50).optional(),
  availableSizes: z.array(z.string()).optional(),
  available_sizes: z.array(z.string()).optional(),
  sizes: z.array(z.string()).optional(),
  availableColors: z.array(z.string()).optional(),
  available_colors: z.array(z.string()).optional(),
  colors: z.array(z.string()).optional(),
  stock: z.coerce.number().int().nonnegative().optional(),
  importSource: z.string().max(50).optional(),
  import_source: z.string().max(50).optional(),
  isActive: z.boolean().optional(),
  is_active: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  is_published: z.boolean().optional(),
  status: z.enum(["active", "draft", "inactive"]).optional(),
});

/** Validate partial product updates. */
export const updateProductSchema = createProductSchema.partial();

/** Validate category creation payloads. */
export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  subtitle: z.string().max(255).optional().nullable(),
  imageUrl: z.string().max(2048).optional().nullable(),
  image_url: z.string().max(2048).optional().nullable(),
  categoryCode: z.string().trim().min(1).max(50).optional(),
  category_code: z.string().trim().min(1).max(50).optional(),
  displayOrder: z.coerce.number().int().min(0).optional(),
  display_order: z.coerce.number().int().min(0).optional(),
  bg: z.string().max(50).optional().nullable(),
});

/** Validate partial category updates. */
export const updateCategorySchema = createCategorySchema.partial();

/** Validate safe cursor-list query values. */
export const listProductsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  category: z.string().max(50).optional(),
  subcategory: z.string().max(100).optional(),
  search: z.string().trim().max(100).optional(),
});
