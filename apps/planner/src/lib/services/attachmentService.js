import { S, save, uid } from '../state.svelte.js'
import { supabase } from '../supabase.js'
import { t } from '../i18n/index.js'

/**
 * @typedef {import('../types.js').PlannerAttachment} PlannerAttachment
 * @typedef {import('../types.js').AttachmentOwnerType} AttachmentOwnerType
 */

const BUCKET = 'planner-attachments'
const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB

/** @type {Map<string, File>} failed / in-flight uploads keep File for retry */
const pendingFiles = new Map()

/** @param {File} file */
export function validateAttachmentFile(file) {
  if (!file || typeof file.size !== 'number') {
    return { valid: false, error: t('attachments.error.forbiddenType', 'File type not allowed') }
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: t('attachments.error.tooLarge', 'File is too large (max 25MB)') }
  }
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  const forbiddenExts = ['exe', 'dmg', 'pkg', 'app', 'sh', 'command', 'bat', 'ps1']
  if (forbiddenExts.includes(ext)) {
    return { valid: false, error: t('attachments.error.forbiddenType', 'File type not allowed') }
  }
  return { valid: true, error: null }
}

/** @param {string} originalName */
export function safeFilename(originalName) {
  // Remove path traversal, control chars, slashes
  return String(originalName ?? 'file')
    .replace(/^.*[\\\/]/, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\//g, '_')
    .slice(0, 100) || 'file'
}

/**
 * Soft-delete all attachments for an owner (task/project tombstone cascade).
 * @param {AttachmentOwnerType} ownerType
 * @param {string} ownerId
 */
export function softDeleteAttachmentsForOwner(ownerType, ownerId) {
  const now = Date.now()
  let changed = false
  for (const att of S.attachments) {
    if (att.ownerType !== ownerType || att.ownerId !== ownerId || att.deletedAt) continue
    att.deletedAt = now
    att.updatedAt = now
    changed = true
  }
  if (changed) save()
}

/**
 * Restore soft-deleted attachments for an owner.
 * @param {AttachmentOwnerType} ownerType
 * @param {string} ownerId
 */
export function restoreAttachmentsForOwner(ownerType, ownerId) {
  let changed = false
  for (const att of S.attachments) {
    if (att.ownerType !== ownerType || att.ownerId !== ownerId || !att.deletedAt) continue
    att.deletedAt = null
    att.updatedAt = Date.now()
    changed = true
  }
  if (changed) save()
}

/**
 * @param {string} ownerType
 * @param {string} ownerId
 * @param {string} url
 */
export function createLinkAttachment(ownerType, ownerId, url) {
  const id = uid()
  /** @type {PlannerAttachment} */
  const att = {
    id,
    ownerType,
    ownerId,
    kind: 'link',
    source: 'system',
    name: url,
    externalUrl: url,
    status: 'ready',
    createdAt: new Date().toISOString(),
    updatedAt: Date.now(),
    deletedAt: null,
  }
  S.attachments.push(att)
  save()
  return att
}

/**
 * @param {AttachmentOwnerType} ownerType
 * @param {string} ownerId
 * @param {File} file
 * @param {'upload'|'paste'|'camera'|'bug-report'|'system'} source
 */
export async function uploadAttachment(ownerType, ownerId, file, source = 'upload') {
  const { valid, error } = validateAttachmentFile(file)
  if (!valid) throw new Error(error)

  const id = uid()
  const kind = file.type.startsWith('image/') ? 'image' : 'file'

  /** @type {PlannerAttachment} */
  const att = {
    id,
    ownerType,
    ownerId,
    kind,
    source,
    name: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: Date.now(),
    deletedAt: null,
  }
  S.attachments.push(att)
  pendingFiles.set(id, file)
  save()

  return runUpload(att, file)
}

/**
 * @param {PlannerAttachment} att
 * @param {File} file
 */
async function runUpload(att, file) {
  try {
    att.status = 'uploading'
    att.updatedAt = Date.now()
    save()

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) throw new Error('Not authenticated')

    const path = `${userData.user.id}/${att.ownerType}/${att.ownerId}/${att.id}/${safeFilename(file.name)}`

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true })

    if (uploadError) throw uploadError

    att.storageBucket = BUCKET
    att.storagePath = path
    att.status = 'ready'
    att.errorCode = undefined
    att.updatedAt = Date.now()
    pendingFiles.delete(att.id)
    save()
    return att
  } catch (e) {
    att.status = 'failed'
    att.errorCode = e?.message ?? String(e)
    att.updatedAt = Date.now()
    save()
    throw e
  }
}

/**
 * Retry a failed upload. Uses the File cached at first upload when `file` omitted.
 * @param {string} id
 * @param {File} [file]
 */
export async function retryAttachmentUpload(id, file) {
  const att = S.attachments.find((a) => a.id === id)
  if (!att || att.status === 'ready') return
  const blob = file ?? pendingFiles.get(id)
  if (!blob) {
    throw new Error(
      t(
        'attachments.error.retryNeedsFile',
        'Original file unavailable — please upload again',
      ),
    )
  }
  pendingFiles.set(id, blob)
  return runUpload(att, blob)
}

/** @param {string} id */
export async function deleteAttachment(id) {
  const att = S.attachments.find((a) => a.id === id)
  if (!att) return

  if (att.storageBucket && att.storagePath) {
    // Try to remove from storage, fire and forget for UI responsiveness
    supabase.storage.from(att.storageBucket).remove([att.storagePath]).catch(console.error)
  }

  pendingFiles.delete(id)
  att.deletedAt = Date.now()
  att.updatedAt = Date.now()
  save()
}

/** @param {string} id */
export function restoreAttachment(id) {
  const att = S.attachments.find((a) => a.id === id)
  if (!att) return
  att.deletedAt = null
  att.updatedAt = Date.now()
  save()
}

/**
 * @param {AttachmentOwnerType} ownerType
 * @param {string} ownerId
 */
export function listAttachmentsForOwner(ownerType, ownerId) {
  return S.attachments.filter(
    (a) => a.ownerType === ownerType && a.ownerId === ownerId && !a.deletedAt,
  )
}

/** @param {PlannerAttachment} att */
export async function getAttachmentUrl(att) {
  if (att.externalUrl) return att.externalUrl
  if (!att.storageBucket || !att.storagePath) return null

  // We use createSignedUrl so it's private and requires auth
  const { data, error } = await supabase.storage
    .from(att.storageBucket)
    .createSignedUrl(att.storagePath, 60 * 60 * 24) // 24 hours

  if (error) {
    console.error('getAttachmentUrl error:', error)
    return null
  }
  return data.signedUrl
}
