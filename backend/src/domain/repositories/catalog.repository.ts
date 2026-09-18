/** Product returned by catalog queries, adapted to real Supabase products schema. */
export interface Product {
  id: string | number;
  title: string;
  name?: string;
  slug: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  productType?: string | null;
  price: number;
  costPrice: number;
  discountPercentage: number;
  imageUrl: string | null;
  frameUrl: string | null;
  images: unknown[];
  availableSizes?: string[];
  availableColors?: string[];
  stock: number;
  importSource: string;
  isActive: boolean;
  isPublished: boolean;
  status: string;
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Category returned by catalog queries. */
export interface Category {
  id?: number | string;
  title?: string;
  name?: string;
  subtitle?: string | null;
  image_url?: string | null;
  imageUrl?: string | null;
  category?: string;
  categoryCode?: string;
  display_order?: number;
  displayOrder?: number;
  created_at?: string | null;
  createdAt?: string | null;
  bg?: string | null;
  button_text?: string | null;
  buttonText?: string | null;
}

/** Cursor page with an optional next cursor. */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

/** Filters supported by the public product listing. */
export interface ProductFilters {
  cursor?: string;
  limit: number;
  category?: string;
  subcategory?: string;
  search?: string;
}

/** Parameterized product and category persistence contract. */
export interface CatalogRepository {
  listProducts(filters: ProductFilters): Promise<CursorPage<Product>>;
  findProductBySlug(slug: string): Promise<Product | null>;
  findProductById(id: string | number): Promise<Product | null>;
  createProduct(input: Record<string, unknown>): Promise<Product>;
  updateProduct(id: string | number, input: Record<string, unknown>): Promise<Product | null>;
  deleteProduct(id: string | number): Promise<boolean>;
  listCategories(): Promise<Category[]>;
  createCategory(input: Record<string, unknown>): Promise<Category>;
  updateCategory(id: number, input: Record<string, unknown>): Promise<Category | null>;
  deleteCategory(id: number): Promise<boolean>;
}
