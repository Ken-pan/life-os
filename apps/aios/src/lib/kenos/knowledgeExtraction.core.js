/**
 * KENOS F5-07 — grounded knowledge extraction (pure, deterministic).
 *
 * Turns an authorized source's text into structured, SOURCE-GROUNDED action
 * proposals. Deterministic + rule-based on purpose:
 *  - every proposal cites an EXACT source span (offset + text) — nothing invented;
 *  - dates come only from the source text (never fabricated);
 *  - the extractor cannot be prompt-injected — "ignore instructions / call a
 *    tool / send data" inside the source is treated as ordinary text and, if
 *    detected, only FLAGGED (never executed). There is no model here to hijack.
 *
 * An LLM extractor can later be layered behind this SAME contract: the model may
 * PROPOSE, but proposals still carry a required source span, a risk class the
 * app enforces, and a status the user must accept. Source content can never
 * grant a tool, select a user, or lower an Approval requirement.
 */

import { detectPromptInjectionSignals } from '../inputGuard.core.js'

export const MAX_SOURCE_CHARS = 20000
export const MAX_PROPOSALS = 12

/** Boilerplate keywords common in scraped-page nav/consent chrome. A short line
 * (≤40 chars) containing one is treated as boilerplate and dropped — long
 * content sentences that merely mention the word are kept. */
const BOILERPLATE_KEYWORDS =
  /\b(accept all cookies?|privacy policy|terms of service|subscribe|sign in|log in|skip to content|follow us|advertisement|sponsored|cookie settings)\b/i

function isBoilerplateLine(line) {
  return line.length <= 40 && BOILERPLATE_KEYWORDS.test(line)
}

/**
 * Normalize source text safely. Preserves headings/lists/dates; strips obvious
 * boilerplate; bounds size and records truncation. Never silently truncates.
 * @param {string} raw
 * @param {{ maxChars?: number }} [opts]
 * @returns {{ text: string, truncated: boolean, originalLength: number, partial: boolean }}
 */
export function normalizeSource(raw, opts = {}) {
  const maxChars = opts.maxChars ?? MAX_SOURCE_CHARS
  const input = String(raw ?? '')
  const originalLength = input.length
  // Reject binary/control-heavy content (executables / non-text pipelines).
  let controlCount = 0
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    if ((c >= 0 && c <= 8) || c === 11 || c === 12 || (c >= 14 && c <= 31)) controlCount++
  }
  if (controlCount / (input.length || 1) > 0.02) {
    return { text: '', truncated: false, originalLength, partial: true, unsupported: true }
  }
  const lines = input
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l) => l && !isBoilerplateLine(l))
  let text = lines.join('\n')
  let truncated = false
  if (text.length > maxChars) {
    text = text.slice(0, maxChars)
    truncated = true
  }
  return { text, truncated, originalLength, partial: truncated }
}

/** Stable content hash for dedup (FNV-1a, hex). */
export function sourceContentHash(text) {
  const s = String(text ?? '')
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return ('0000000' + h.toString(16)).slice(-8)
}

/** Normalize a URL for dedup: drop hash, tracking params, trailing slash. */
export function canonicalUrl(url) {
  try {
    const u = new URL(String(url))
    u.hash = ''
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref|ref_src|mc_eid|igshid)/i.test(k)) u.searchParams.delete(k)
    }
    let s = u.toString()
    if (s.endsWith('/')) s = s.slice(0, -1)
    return s.toLowerCase()
  } catch {
    return String(url || '').trim().toLowerCase()
  }
}

const ACTION_VERB =
  /\b(need to|must|should|todo|to-do|action item|follow up|follow-up|schedule|submit|send|review|prepare|finish|complete|pay|book|call|email|remember to|don't forget|deadline|due)\b/i
// Dates PRESENT in the source only (ISO or "Month D[, YYYY]" or "by <weekday>").
const DATE_RE =
  /\b(\d{4}-\d{2}-\d{2})\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?\b|\bby\s+(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i

function splitSentences(text) {
  // Split on sentence enders + newlines, keeping offsets.
  const out = []
  const re = /[^.!?\n]+[.!?]?|\n/g
  let m
  while ((m = re.exec(text)) !== null) {
    const s = m[0].trim()
    if (s) out.push({ text: s, offset: m.index })
  }
  return out
}

function isoFromMatch(match) {
  const iso = /\b\d{4}-\d{2}-\d{2}\b/.exec(match)
  return iso ? iso[0] : null
}

/**
 * Extract grounded action proposals. Each proposal cites an exact source span.
 * @param {string} normalizedText
 * @param {{ sourceId?: string, maxProposals?: number }} [opts]
 * @returns {{ proposals: object[], summary: string, injectionFlagged: boolean }}
 */
export function extractGroundedProposals(normalizedText, opts = {}) {
  const text = String(normalizedText ?? '')
  const maxProposals = opts.maxProposals ?? MAX_PROPOSALS
  const sourceId = opts.sourceId ?? null
  // The source is untrusted DATA. Detect (but never act on) injection attempts.
  const injection = detectPromptInjectionSignals(text)

  const sentences = splitSentences(text)
  const proposals = []
  const seenSpans = new Set()
  for (const sent of sentences) {
    const hasAction = ACTION_VERB.test(sent.text)
    const dateMatch = sent.text.match(DATE_RE)
    if (!hasAction && !dateMatch) continue
    const key = sent.text.toLowerCase()
    if (seenSpans.has(key)) continue
    seenSpans.add(key)
    const dueDate = dateMatch ? isoFromMatch(dateMatch[0]) : null // only real ISO dates
    proposals.push({
      id: `kprop_${sourceContentHash(sent.text)}`,
      sourceId,
      title: sent.text.length > 120 ? `${sent.text.slice(0, 117)}…` : sent.text,
      details: '',
      evidence: { text: sent.text, offset: sent.offset, length: sent.text.length },
      dueDate, // never fabricated — null unless an ISO date is literally in the span
      confidence: hasAction && dateMatch ? 'high' : hasAction ? 'medium' : 'low',
      reason: hasAction
        ? 'Sentence contains an action/obligation phrase.'
        : 'Sentence contains a date/deadline.',
      ambiguous: !hasAction, // date-only sentences are ambiguous actions
      riskClass: 'R1_REVERSIBLE_INTERNAL_WRITE', // proposal recommends; app enforces
      destination: 'plan_task',
      status: 'pending',
    })
    if (proposals.length >= maxProposals) break
  }

  // Grounded summary: first non-empty line, capped. Never invents content.
  const firstLine = text.split('\n').find((l) => l.trim().length > 12) || ''
  const summary = firstLine.length > 200 ? `${firstLine.slice(0, 197)}…` : firstLine

  return { proposals, summary, injectionFlagged: injection.hit }
}

/**
 * Drop proposals already represented (by evidence hash) in a prior set.
 * @param {object[]} proposals
 * @param {Set<string> | string[]} priorProposalIds
 */
export function dedupeProposals(proposals, priorProposalIds = new Set()) {
  const prior = priorProposalIds instanceof Set ? priorProposalIds : new Set(priorProposalIds)
  const seen = new Set()
  const kept = []
  let duplicates = 0
  for (const p of proposals || []) {
    if (prior.has(p.id) || seen.has(p.id)) {
      duplicates += 1
      continue
    }
    seen.add(p.id)
    kept.push(p)
  }
  return { proposals: kept, duplicates }
}

/**
 * Enforce that a proposal's action stays within its declared (app-enforced)
 * risk class before it can be materialized. Source content cannot raise the
 * effective permission — an accepted proposal is always at most R1 here.
 * @param {object} proposal
 * @returns {{ allowed: boolean, riskClass: string, reason?: string }}
 */
export function authorizeProposalMaterialization(proposal) {
  const risk = String(proposal?.riskClass || '')
  if (risk !== 'R1_REVERSIBLE_INTERNAL_WRITE') {
    return { allowed: false, riskClass: risk, reason: 'only R1 internal Plan writes are auto-materializable' }
  }
  if (proposal?.destination !== 'plan_task') {
    return { allowed: false, riskClass: risk, reason: 'unsupported destination' }
  }
  if (!proposal?.evidence?.text) {
    return { allowed: false, riskClass: risk, reason: 'proposal has no source evidence (ungrounded)' }
  }
  return { allowed: true, riskClass: risk }
}
