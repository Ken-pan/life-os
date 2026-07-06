/**
 * Interaction graph — nodes (page states) + edges (actions taken).
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

/**
 * @param {string} dataDir
 */
export function createGraphStore(dataDir) {
  const graphPath = path.join(dataDir, 'interaction-graph.json')
  const logPath = path.join(dataDir, 'action-log.json')

  function loadGraph() {
    if (!fs.existsSync(graphPath)) {
      return { schema: 'web-state-devtools/interaction-graph/v1', nodes: [], edges: [] }
    }
    return JSON.parse(fs.readFileSync(graphPath, 'utf8'))
  }

  function saveGraph(graph) {
    fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2))
  }

  function loadLog() {
    if (!fs.existsSync(logPath)) return []
    return JSON.parse(fs.readFileSync(logPath, 'utf8'))
  }

  function appendLog(entry) {
    const log = loadLog()
    log.push({ ...entry, at: new Date().toISOString() })
    if (log.length > 200) log.splice(0, log.length - 200)
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2))
  }

  /**
   * @param {Record<string, unknown>} snapshot
   * @param {Record<string, unknown>} [meta]
   */
  function ensureNode(snapshot, meta = {}) {
    const graph = loadGraph()
    const url = snapshot.page?.url || 'about:blank'
    let node = graph.nodes.find((n) => n.url === url && n.label === (meta.label || 'captured'))
    if (!node) {
      node = {
        id: crypto.randomUUID(),
        url,
        title: snapshot.page?.title,
        pageType: meta.pageType,
        capturedAt: snapshot.capturedAt || new Date().toISOString(),
        label: meta.label || 'captured',
        stats: {
          controls: snapshot.controls?.length,
          regions: snapshot.sensor?.regions?.length,
        },
      }
      graph.nodes.push(node)
      if (graph.nodes.length > 100) graph.nodes.shift()
    } else {
      node.capturedAt = snapshot.capturedAt || node.capturedAt
      node.stats = {
        controls: snapshot.controls?.length,
        regions: snapshot.sensor?.regions?.length,
      }
    }
    saveGraph(graph)
    return node
  }

  /**
   * @param {string} fromId
   * @param {string} toId
   * @param {Record<string, unknown>} action
   */
  function addEdge(fromId, toId, action) {
    const graph = loadGraph()
    graph.edges.push({
      id: crypto.randomUUID(),
      from: fromId,
      to: toId,
      action: action.action || action.type,
      selector: action.selector || action.params?.selector,
      url: action.url || action.params?.url,
      at: new Date().toISOString(),
    })
    if (graph.edges.length > 300) graph.edges.shift()
    saveGraph(graph)
  }

  /**
   * @param {Record<string, unknown>} entry
   */
  function logAction(entry) {
    appendLog(entry)
  }

  return { loadGraph, ensureNode, addEdge, logAction, loadLog, graphPath, logPath }
}
