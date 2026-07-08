import base from './playwright.config.js';

/** CI / port-conflict override — point at an already-running dev server. */
export default {
  ...base,
  webServer: undefined,
  use: {
    ...base.use,
    baseURL: process.env.FITNESS_E2E_BASE_URL ?? 'http://127.0.0.1:5190',
  },
};
