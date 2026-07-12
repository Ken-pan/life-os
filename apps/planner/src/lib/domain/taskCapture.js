const TRAILING_PROJECT_QUERY = /(?:^|\s)@([^@\s]*)$/

/** @param {string} value */
export function projectQueryFromTitle(value) {
  const match = value.match(TRAILING_PROJECT_QUERY)
  return match ? match[1].toLowerCase() : null
}

/** @param {string} value */
export function titleWithoutProjectQuery(value) {
  return value.replace(TRAILING_PROJECT_QUERY, '').trim()
}

/**
 * @param {import('../types.js').PlannerProject[]} projects
 * @param {string} query
 * @param {number} [limit]
 */
export function filterCaptureProjects(projects, query, limit = 5) {
  const needle = query.trim().toLocaleLowerCase()
  return projects
    .filter((project) => project.title.toLocaleLowerCase().includes(needle))
    .slice(0, limit)
}

