export function bestBuyReceiptIdEncodedDate(
  orderId?: string | null,
): string | undefined

export function isPollutedInStoreReturnDate(order: {
  channel?: string
  orderId?: string
  status?: string
  orderDate?: string
  statusDate?: string
}): boolean

export function parseVisibleDateText(raw?: string | null): string | undefined
