export function bestBuyReceiptIdEncodedDate(
  orderId?: string | null,
): string | undefined
export function isPollutedInStoreReturnDate(order: {
  status?: string | null
  orderDate?: string | null
  statusDate?: string | null
}): boolean
export function parseVisibleDateText(raw?: string | null): string | undefined
export function deriveBestBuyReturnInfoDecision(...args: unknown[]): unknown
export function normalizeBestBuyOrderId(...args: unknown[]): unknown
