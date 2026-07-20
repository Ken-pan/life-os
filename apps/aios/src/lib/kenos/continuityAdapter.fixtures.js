/**
 * Thin re-exports so aios continuity adapter tests stay dependency-light.
 */
export {
  buildResumeDescriptor,
  resumeDescriptorToOpenUrl,
  isResumeExpired,
  fallbackResumeToHome,
} from '@life-os/platform-web/kenos-space-continuity'

/** Mirror bindSpaceSwitcherOwner clear semantics for account isolation proofs. */
export function bindOwnerClear(state, nextOwnerId) {
  if (state.ownerId && nextOwnerId && state.ownerId !== nextOwnerId) {
    return { ownerId: nextOwnerId, resume: {}, recent: [], pinned: [] }
  }
  return state
}
