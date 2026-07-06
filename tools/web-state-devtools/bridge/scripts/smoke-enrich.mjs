#!/usr/bin/env node
/** Smoke test for enrich pipeline — no browser required. */
import { enrichSnapshot, buildSummaryMd } from '../lib/enrich.mjs';

const sample = {
  schema: 'web-state-devtools/snapshot/v1',
  capturedAt: new Date().toISOString(),
  page: {
    url: 'http://localhost:5173/',
    title: 'Music OS — Library',
    viewport: { width: 1280, height: 800 },
  },
  headings: [
    { level: 1, text: 'Library', selector: 'h1' },
    { level: 2, text: 'Recently played', selector: 'h2' },
  ],
  controls: [
    {
      tag: 'button',
      role: 'button',
      name: 'Play all',
      bestSelector: '[data-testid="play-all"]',
      selectorCandidates: [{ strategy: 'data-testid', value: '[data-testid="play-all"]', score: 100 }],
    },
    {
      tag: 'input',
      role: 'textbox',
      type: 'search',
      name: 'Search tracks',
      bestSelector: 'input[aria-label="Search tracks"]',
    },
  ],
  links: [{ text: 'Settings', href: 'http://localhost:5173/settings' }],
  forms: [
    {
      id: 'search-form',
      name: 'Search',
      fields: [{ label: 'Search tracks', type: 'search', required: false, bestSelector: 'input[type=search]' }],
    },
  ],
  elements: [{ tag: 'nav', role: 'navigation', name: 'Main', testId: 'main-nav' }],
  storageKeys: { localStorage: ['theme'], sessionStorage: [] },
};

const enriched = enrichSnapshot(sample);
const md = buildSummaryMd(sample);

console.log('--- summary.md preview ---');
console.log(md.slice(0, 600));
console.log('...\n');
console.log('stats:', enriched.derived.stats);
console.log('selectors.interactive:', enriched.derived.selectors.interactive.length);
console.log('OK');
