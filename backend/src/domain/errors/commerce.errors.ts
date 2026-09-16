/**
 * =============================================================================
 * commerce.errors.ts — Domain errors for commerce, checkout & inventory
 * =============================================================================
 */

/** Typed error thrown when an inventory check fails during checkout or cart operations. */
export class OutOfStockError extends Error {
  public constructor(
    public readonly variantId: string | number,
    message?: string,
    public readonly statusCode = 409
  ) {
    super(
      message ||
        `الكمية المطلوبة غير متوفرة في المخزون للمتغير ${variantId} / Out of stock for variant ${variantId}`
    );
    this.name = "OutOfStockError";
  }
}
