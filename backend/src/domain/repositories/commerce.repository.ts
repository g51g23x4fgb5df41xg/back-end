/** A sellable product variant with independent price and inventory. */
export interface ProductVariant {
  id: string;
  productId: string;
  size: string;
  color: string;
  sku: string;
  price: number | null;
  stockQuantity: number;
}

/** A persisted cart item with the latest variant information. */
export interface CartItem {
  id: string;
  variantId: string;
  quantity: number;
  variant?: ProductVariant;
}

/** A persisted user or guest cart. */
export interface Cart {
  id: string;
  userId: string | null;
  sessionToken: string | null;
  items: CartItem[];
}

/** An order line. */
export interface OrderItem {
  productId?: string | number;
  variantId?: string;
  productTitle: string;
  title?: string;
  size?: string;
  color?: string;
  unitPrice: number;
  price?: number;
  quantity: number;
}

/** An order summary returned after checkout, fully mapped to the real Supabase orders schema. */
export interface Order {
  id: string | number;
  orderNumber?: string;
  userId?: string | null;
  fullName: string;
  phoneNumber: string;
  address: string;
  wilaya?: string | null;
  commune?: string | null;
  deliveryType?: string;
  deliveryProvider?: string;
  shippingFee: number;
  cartItems: any[];
  totalPrice: number;
  subtotal?: number;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  trackingNumber?: string | null;
  chargilyInvoiceId?: string | null;
  receiptUrl?: string | null;
  createdAt?: string;
}

/** Input needed to identify a persisted cart. */
export interface CartOwner {
  userId?: string;
  sessionToken?: string;
}

export interface CheckoutInput {
  fullName: string;
  phoneNumber: string;
  address: string;
  wilaya?: string;
  commune?: string;
  deliveryType?: string;
  deliveryProvider?: string;
  shippingFee?: number;
  paymentMethod: string;
  paymentStatus?: string;
  cartItems?: any[];
  totalPrice?: number;
  trackingNumber?: string;
  chargilyInvoiceId?: string;
  receiptUrl?: string;
}

/** Contract for variant, cart, and order persistence. */
export interface CommerceRepository {
  listVariants(productId: string): Promise<ProductVariant[]>;
  createVariant(input: Record<string, unknown>): Promise<ProductVariant>;
  updateVariant(id: string, input: Record<string, unknown>): Promise<ProductVariant | null>;
  deleteVariant(id: string): Promise<boolean>;
  syncVariants(
    productId: string | number,
    variants: Array<{ size: string; color: string; stock_quantity?: number; stockQuantity?: number; price?: number }>
  ): Promise<{ totalStock: number }>;
  getOrCreateCart(owner: CartOwner): Promise<Cart>;
  addCartItem(owner: CartOwner, variantId: string, quantity: number): Promise<Cart>;
  updateCartItem(owner: CartOwner, itemId: string, quantity: number): Promise<Cart>;
  removeCartItem(owner: CartOwner, itemId: string): Promise<void>;
  checkout(owner: CartOwner, input: CheckoutInput): Promise<Order>;
  listOrders(userId?: string): Promise<Order[]>;
  getOrderById(orderId: string | number): Promise<Order | null>;
  updateOrderStatus(orderId: string | number, status: string, extra?: Record<string, unknown>): Promise<Order | null>;
  deleteOrder(orderId: string | number): Promise<boolean>;
}
