import type {
  Cart,
  CartOwner,
  CheckoutInput,
  CommerceRepository,
  Order,
  ProductVariant,
} from "../../domain/repositories/commerce.repository.js";

/** Coordinates variant management, persistent cart operations, and orders. */
export class CommerceUseCases {
  public constructor(private readonly repository: CommerceRepository) {}

  public async listVariants(productId: string): Promise<ProductVariant[]> {
    return this.repository.listVariants(productId);
  }

  public async createVariant(input: Record<string, unknown>): Promise<ProductVariant> {
    return this.repository.createVariant(input);
  }

  public async updateVariant(id: string, input: Record<string, unknown>): Promise<ProductVariant | null> {
    return this.repository.updateVariant(id, input);
  }

  public async deleteVariant(id: string): Promise<boolean> {
    return this.repository.deleteVariant(id);
  }

  public async syncVariants(
    productId: string | number,
    variants: Array<{ size: string; color: string; stock_quantity?: number; stockQuantity?: number; price?: number }>
  ): Promise<{ totalStock: number }> {
    return this.repository.syncVariants(productId, variants);
  }

  public async getCart(owner: CartOwner): Promise<Cart> {
    return this.repository.getOrCreateCart(owner);
  }

  public async addItem(owner: CartOwner, variantId: string, quantity: number): Promise<Cart> {
    return this.repository.addCartItem(owner, variantId, quantity);
  }

  public async updateItem(owner: CartOwner, itemId: string, quantity: number): Promise<Cart> {
    return this.repository.updateCartItem(owner, itemId, quantity);
  }

  public async removeItem(owner: CartOwner, itemId: string): Promise<void> {
    return this.repository.removeCartItem(owner, itemId);
  }

  public async checkout(owner: CartOwner, input: CheckoutInput): Promise<Order> {
    return this.repository.checkout(owner, input);
  }

  public async listOrders(userId?: string): Promise<Order[]> {
    return this.repository.listOrders(userId);
  }

  public async getOrderById(orderId: string | number): Promise<Order | null> {
    return this.repository.getOrderById(orderId);
  }

  public async updateOrderStatus(
    orderId: string | number,
    status: string,
    extra?: Record<string, unknown>
  ): Promise<Order | null> {
    return this.repository.updateOrderStatus(orderId, status, extra);
  }

  public async deleteOrder(orderId: string | number): Promise<boolean> {
    return this.repository.deleteOrder(orderId);
  }
}
