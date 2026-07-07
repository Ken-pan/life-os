/**
 * Shared wait/capture defaults for recipe engine (site-agnostic patterns).
 */

/** @type {Record<string, { wait: object, fast: boolean }>} */
export const RECIPE_WAIT_PRESETS = {
  'amazon-orders': {
    wait: {
      selectors: [
        'a[href*="order-details"]',
        'a[href*="orderID="]',
        '.order-card.js-order-card',
        'img[src*="media-amazon.com/images/I/"]',
      ],
      minCount: 1,
      stableMs: 300,
      timeoutMs: 12000,
      pollMs: 40,
      requirePrice: true,
    },
    fast: true,
  },
  'bestbuy-orders': {
    wait: {
      selectors: [
        '[data-testid="order-item"]',
        '[data-testid="virtuoso-item-list"]',
        'main',
      ],
      minCount: 1,
      stableMs: 400,
      timeoutMs: 15000,
    },
    fast: true,
  },
  'target-orders': {
    wait: {
      selectors: [
        'main',
        'a[href*="/orders"]',
        '[data-test*="order"]',
        '[class*="order"]',
      ],
      minCount: 1,
      stableMs: 300,
      timeoutMs: 12000,
    },
    fast: true,
  },
  generic_list: {
    wait: {
      selectors: [
        'main a[href]',
        '[role="listitem"]',
        'article',
        'table tbody tr',
      ],
      minCount: 1,
      stableMs: 300,
      timeoutMs: 10000,
    },
    fast: true,
  },
  generic_table: {
    wait: {
      selectors: ['table tbody tr', '[role="row"]', '[role="gridcell"]'],
      minCount: 1,
      stableMs: 300,
      timeoutMs: 10000,
    },
    fast: true,
  },
}

/**
 * @param {string} recipeId
 * @param {Record<string, unknown>} [recipeCapture]
 */
export function resolveCaptureConfig(recipeId, recipeCapture = {}) {
  const preset =
    RECIPE_WAIT_PRESETS[recipeId] || RECIPE_WAIT_PRESETS.generic_list
  return {
    action: recipeCapture.action || 'capture',
    fast: recipeCapture.fast ?? preset.fast,
    wait: { ...preset.wait, ...(recipeCapture.wait || {}) },
    minItemsPerPage: Number(recipeCapture.minItemsPerPage) || 1,
    captureTimeoutMs: Number(recipeCapture.captureTimeoutMs) || 45000,
    navigateTimeoutMs: Number(recipeCapture.navigateTimeoutMs) || 60000,
  }
}
