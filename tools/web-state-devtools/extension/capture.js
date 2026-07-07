/**
 * Entry point injected into active tab — content-ready wait → minimal quiescence → extract.
 */
;(async function capturePageState() {
  const core = window.__WSD_CORE__
  if (!core) throw new Error('WSD core not loaded')

  const isAmazon = /amazon\./i.test(location.hostname)
  const isBestBuy = /bestbuy\./i.test(location.hostname)
  const isTarget = /target\./i.test(location.hostname)
  const opts = window.__WSD_CAPTURE_OPTS__ || {}

  /** @type {Record<string, unknown>} */
  const captureMeta = {}

  if (window.__WSD_WAIT_READY__ && window.__WSD_CAPTURE_WAIT__) {
    try {
      captureMeta.waitReady = await window.__WSD_WAIT_READY__.waitForContent(
        window.__WSD_CAPTURE_WAIT__,
      )
    } catch (err) {
      captureMeta.waitError = String(err?.message || err)
    }
  }

  let quiescence = {
    quietMs: 0,
    timedOut: false,
    skipped: !!opts.skipQuiescence,
  }
  if (!opts.skipQuiescence) {
    const quietMs =
      opts.quietMs ?? (isAmazon || isBestBuy || isTarget ? 120 : 400)
    const timeoutMs =
      opts.timeoutMs ?? (isAmazon || isBestBuy || isTarget ? 800 : 1500)
    try {
      quiescence = {
        ...(await core.waitForQuiescence(timeoutMs, quietMs)),
        skipped: false,
      }
    } catch {
      quiescence = { quietMs: 0, timedOut: true, skipped: false }
    }
  }

  let snapshot
  try {
    snapshot = core.extractBaseSnapshot(quiescence)
  } catch (err) {
    throw new Error(`Extract failed: ${err?.message || err}`)
  }

  if (captureMeta.waitReady || captureMeta.waitError) {
    snapshot.captureMeta = { ...(snapshot.captureMeta || {}), ...captureMeta }
  }

  if (window.__WSD_REGION_SCOPER__) {
    try {
      snapshot.sensor = window.__WSD_REGION_SCOPER__.buildSensorLayer()
    } catch (err) {
      snapshot.sensorError = String(err?.message || err)
    }
  }

  const adapters = window.__WSD_ADAPTERS__ || []
  for (const adapter of adapters) {
    try {
      if (adapter.matches?.(location.href)) {
        if (adapter.prepare) {
          const prep = await Promise.resolve(adapter.prepare())
          if (prep && typeof prep === 'object') {
            snapshot.captureMeta = {
              ...(snapshot.captureMeta || {}),
              adapterPrepare: { id: adapter.id, ...prep },
            }
          }
        }
        const result = adapter.run?.()
        if (result) snapshot.adapter = result
      }
    } catch (err) {
      snapshot.adapterError = {
        id: adapter.id,
        message: String(err?.message || err),
      }
    }
  }

  if (window.__WSD_TABLE_WALKER__) {
    try {
      snapshot.tables = window.__WSD_TABLE_WALKER__.walkTables()
    } catch (err) {
      snapshot.tableWalkerError = String(err?.message || err)
    }
  }

  if (window.__WSD_AX_SNAP__ && !opts.skipAxSnap) {
    try {
      snapshot.snapV2 = window.__WSD_AX_SNAP__.buildSnapV2()
    } catch (err) {
      snapshot.snapV2Error = String(err?.message || err)
    }
  }

  return snapshot
})()
