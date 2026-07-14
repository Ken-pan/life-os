const MAX_ID_LENGTH = 160;
const MAX_TITLE_LENGTH = 240;

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

/** Stable identity for one PaperOS page; page index may change after moves. */
export function paperLinkId(deviceId, noteId, pageId) {
  return `${deviceId}:${noteId}:${pageId}`;
}

export function normalizePaperLink(raw, { deviceId, linkedAt = Date.now() } = {}) {
  const normalizedDeviceId = cleanString(raw?.deviceId || deviceId, MAX_ID_LENGTH);
  const noteId = cleanString(raw?.noteId, MAX_ID_LENGTH);
  const pageId = cleanString(raw?.pageId, MAX_ID_LENGTH);
  const pageIndex = Number(raw?.pageIndex);
  if (!normalizedDeviceId || !noteId || !pageId || !Number.isInteger(pageIndex) || pageIndex < 1)
    return null;

  return {
    id: paperLinkId(normalizedDeviceId, noteId, pageId),
    deviceId: normalizedDeviceId,
    noteId,
    pageId,
    pageIndex,
    noteTitle: cleanString(raw?.noteTitle, MAX_TITLE_LENGTH) || 'PaperOS notebook',
    linkedAt: Number(raw?.linkedAt) || Number(linkedAt),
  };
}

export function normalizePaperLinks(rawLinks) {
  if (!Array.isArray(rawLinks)) return [];
  const links = new Map();
  for (const raw of rawLinks) {
    const link = normalizePaperLink(raw, { deviceId: raw?.deviceId, linkedAt: raw?.linkedAt });
    if (link) links.set(link.id, link);
  }
  return [...links.values()];
}

export function paperLinksForTask(task) {
  return normalizePaperLinks(task?.meta?.paperLinks);
}

export function upsertPaperLink(task, action, deviceId, linkedAt = Date.now()) {
  const link = normalizePaperLink(action, { deviceId, linkedAt });
  if (!link) return null;
  const links = new Map(paperLinksForTask(task).map((item) => [item.id, item]));
  links.set(link.id, link);
  return {
    ...task,
    meta: {
      ...(task?.meta || {}),
      paperLinks: [...links.values()],
    },
    updatedAt: Number(linkedAt),
  };
}

export function taskHasPaperLink(task, action, deviceId) {
  const candidate = normalizePaperLink(action, { deviceId });
  return Boolean(candidate && paperLinksForTask(task).some((link) =>
    link.id === candidate.id && link.pageIndex === candidate.pageIndex
  ));
}

export function serializePaperTask(task, fallbackUpdatedAt = Date.now()) {
  return {
    id: task.id,
    title: task.title,
    notes: task.notes || '',
    priority: task.priority || 'P3',
    dueDate: task.dueDate || null,
    completed: Boolean(task.completed),
    updatedAt: Number(task.updatedAt || task.createdAt || fallbackUpdatedAt),
    paperLinks: paperLinksForTask(task),
  };
}
