/**
 * 事件日志的本地仓(能力17)—— IndexedDB 追加式,**只增不改**。
 *
 * 与 localStorage 的项目状态(LWW 覆盖)相反:这里是历史,覆盖即销毁。
 * 事件形状见 spatial/event-derive.js(纯派生逻辑在那边,node 可测)。
 * 本地优先:先落盘本机;将来上云(home.events 表)只需把未同步事件
 * 批量 INSERT —— append-only 天然幂等,不需要 LWW。
 *
 * 失败策略:事件是增强层,不是主数据 —— IndexedDB 打不开/写失败一律
 * 静默降级(console.warn),绝不打断用户正在做的操作。
 */
import { makeEvent } from './spatial/event-derive.js'

const DB_NAME = 'homeos_events'
const DB_VERSION = 1
const STORE = 'events'
const OPEN_TIMEOUT_MS = 8000
/** 派生一次最多读多少条(按 ts 倒序取最近的):日志年级增长,派生不该无界 */
const READ_CAP = 8000

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null

function idbAvailable() {
  return typeof indexedDB !== 'undefined'
}

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    let settled = false
    const done = (fn, v) => {
      if (settled) return
      settled = true
      fn(v)
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('ts', 'ts')
      }
    }
    req.onsuccess = () => {
      // 别的标签页要升版本时会发 versionchange —— 不让路它就会被永久阻塞
      req.result.onversionchange = () => {
        req.result.close()
        dbPromise = null
      }
      done(resolve, req.result)
    }
    req.onerror = () => done(reject, req.error ?? new Error('indexedDB open failed'))
    req.onblocked = () => done(reject, new Error('indexedDB blocked'))
    setTimeout(() => done(reject, new Error('indexedDB open timeout')), OPEN_TIMEOUT_MS)
  })
  dbPromise.catch(() => {
    dbPromise = null
  })
  return dbPromise
}

/**
 * 记一条事件(fire-and-forget:调用方不等它,失败静默)。
 * @param {string} type
 * @param {Record<string, string>} [subject]
 * @param {Record<string, any>} [data]
 * @returns {Promise<void>}
 */
export async function logEvent(type, subject = {}, data = {}) {
  if (!idbAvailable()) return
  const event = makeEvent(type, subject, data)
  try {
    const db = await openDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).add(event)
      tx.oncomplete = () => resolve(undefined)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('tx abort'))
    })
  } catch (e) {
    console.warn('[event-log] 记事件失败(忽略):', e)
  }
}

/**
 * 批量记(一次事务,比如一次扫描合并出几十条 object_observed)。
 * @param {Array<{ type: string, subject?: Record<string, string>, data?: Record<string, any> }>} entries
 */
export async function logEvents(entries) {
  if (!idbAvailable() || !entries.length) return
  const events = entries.map((e) => makeEvent(e.type, e.subject ?? {}, e.data ?? {}))
  try {
    const db = await openDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      for (const ev of events) store.add(ev)
      tx.oncomplete = () => resolve(undefined)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('tx abort'))
    })
  } catch (e) {
    console.warn('[event-log] 批量记事件失败(忽略):', e)
  }
}

/**
 * 读事件(按 ts 升序返回;超过 READ_CAP 只取**最近**的那段)。
 * @returns {Promise<any[]>} 拿不到(SSR/私隐模式)返回 []
 */
export async function listEvents() {
  if (!idbAvailable()) return []
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const idx = tx.objectStore(STORE).index('ts')
      /** @type {any[]} */
      const out = []
      // 倒序游标取最近 READ_CAP 条,再翻回升序
      const req = idx.openCursor(null, 'prev')
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor && out.length < READ_CAP) {
          out.push(cursor.value)
          cursor.continue()
        } else {
          resolve(out.reverse())
        }
      }
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    console.warn('[event-log] 读事件失败(忽略):', e)
    return []
  }
}

/** 事件总数(设置页/调试用) */
export async function countEvents() {
  if (!idbAvailable()) return 0
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).count()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return 0
  }
}
