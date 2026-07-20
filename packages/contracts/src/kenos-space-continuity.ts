/**
 * Kenos Space Continuity — shared ResumeDescriptor / SpaceRegistry contract.
 * Web (spaceSwitcher.core) and Apple (KenosSpaceSwitcherStore) must stay semantic twins.
 * Domains keep native UI; Continuity only stores resume pointers (no sensitive body text).
 */
import { z } from 'zod'

export const KENOS_RESUME_DESCRIPTOR_VERSION = 1 as const

/** Canonical space ids (aligned with hosted listKey suffix / KenosDomain subset). */
export const KenosSpaceIdValues = [
  'plan',
  'training',
  'money',
  'music',
  'home',
  'knowledge',
  'work',
  'work-focus',
] as const
export const KenosSpaceIdSchema = z.enum(KenosSpaceIdValues)
export type KenosSpaceId = z.infer<typeof KenosSpaceIdSchema>

const SensitiveMarker = /\b(token|secret|password|authorization|cookie|bearer|api[_-]?key)\b/i

function rejectSensitiveSummary(path: string, value: string, ctx: z.RefinementCtx) {
  if (SensitiveMarker.test(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message: `${path} must not contain sensitive credential markers`,
    })
  }
}

/**
 * Stage Manager–style resume pointer for a Space.
 * `route` is path or absolute same-app / known-domain URL.
 * `substate` holds non-sensitive UI anchors (filter, set index, timer remain, …).
 */
export const KenosResumeDescriptorSchema = z
  .object({
    version: z.literal(KENOS_RESUME_DESCRIPTOR_VERSION),
    userId: z.string().min(1),
    spaceId: z.string().min(1),
    route: z.string().min(1),
    entityId: z.string().min(1).optional(),
    substate: z.record(z.unknown()).optional(),
    displayTitle: z.string().min(1).max(120),
    displaySubtitle: z.string().max(200).optional(),
    updatedAt: z.string().datetime(),
    expiresAt: z.string().datetime().optional(),
  })
  .superRefine((value, ctx) => {
    rejectSensitiveSummary('displayTitle', value.displayTitle, ctx)
    if (value.displaySubtitle) {
      rejectSensitiveSummary('displaySubtitle', value.displaySubtitle, ctx)
    }
    if (value.expiresAt && Date.parse(value.expiresAt) < Date.parse(value.updatedAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'expiresAt must not be earlier than updatedAt',
      })
    }
  })
export type KenosResumeDescriptor = z.infer<typeof KenosResumeDescriptorSchema>

export const KenosSpaceContextSchema = z.object({
  spaceId: z.string().min(1),
  title: z.string().min(1),
  route: z.string().min(1),
  entityId: z.string().min(1).nullable().optional(),
  summary: z.string().max(200).optional(),
})
export type KenosSpaceContext = z.infer<typeof KenosSpaceContextSchema>

export const KenosSpaceRegistryEntrySchema = z.object({
  spaceId: z.string().min(1),
  title: z.string().min(1),
  icon: z.string().min(1),
  accent: z.string().min(1),
  listKey: z.string().min(1),
  href: z.string().min(1),
  external: z.boolean().default(false),
})
export type KenosSpaceRegistryEntry = z.infer<typeof KenosSpaceRegistryEntrySchema>

/**
 * Adapter surface (implemented per domain app — not a runtime Zod object).
 * open / suspend / resume / getContext / clearUserState.
 */
export type KenosSpaceAdapter = {
  spaceId: string
  title: string
  icon: string
  accent: string
  open(target?: KenosResumeDescriptor): Promise<void>
  suspend(): Promise<KenosResumeDescriptor>
  resume(descriptor: KenosResumeDescriptor): Promise<void>
  getContext(): Promise<KenosSpaceContext>
  clearUserState(userId: string): Promise<void>
}

/** Continue store envelope (user-scoped persistence). */
export const KenosContinueStoreSchema = z.object({
  version: z.literal(2),
  ownerId: z.string().nullable(),
  recent: z.array(z.string()).max(12),
  pinned: z.array(z.string()),
  /** keyed by listKey (`hosted:plan`) or spaceId */
  resume: z.record(KenosResumeDescriptorSchema),
  currentListKey: z.string().nullable(),
})
export type KenosContinueStore = z.infer<typeof KenosContinueStoreSchema>

/** listKey helpers — keep Web / Apple catalogs aligned. */
export function spaceIdFromListKey(listKey: string): string {
  const key = String(listKey || '').trim()
  if (key.startsWith('hosted:')) return key.slice('hosted:'.length)
  if (key.startsWith('external:')) return key.slice('external:'.length)
  return key
}

export function listKeyForSpaceId(spaceId: string, namespace: 'hosted' | 'external' = 'hosted'): string {
  return `${namespace}:${String(spaceId || '').trim()}`
}
