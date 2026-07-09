/// <reference types="vite/client" />

declare module '*amazon-orders-parser.mjs' {
  export function deriveAmazonReturnInfoDecision(...args: any[]): any
}

declare module '*bestbuy-orders-parser.mjs' {
  export function bestBuyReceiptIdEncodedDate(...args: any[]): any
  export function isPollutedInStoreReturnDate(...args: any[]): any
  export function parseVisibleDateText(...args: any[]): any
  export function deriveBestBuyReturnInfoDecision(...args: any[]): any
  export function normalizeBestBuyOrderId(...args: any[]): any
}
