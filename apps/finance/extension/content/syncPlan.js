// 与 src/lib/extensionSync.ts 保持算法一致的抓取计划工具（扩展 content script 用）。
// 扩展无法 import TS，此处为镜像实现；改算法时请同步两边。

(() => {
  if (window.FOS_PLAN) return;

  const BALANCE_EPSILON = 0.5;
  const SCROLL_BUFFER_DAYS = 3;

  function normalize(s) {
    return String(s ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function nameMatches(a, b) {
    const na = normalize(a);
    const nb = normalize(b);
    if (na === nb) return true;
    const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
    if (short.length < 2) return false;
    const idx = long.indexOf(short);
    if (idx < 0) return false;
    const before = idx === 0 ? "" : long[idx - 1];
    const after = idx + short.length >= long.length ? "" : long[idx + short.length];
    const isWordChar = (c) => /[a-z0-9]/.test(c);
    return (!before || !isWordChar(before)) && (!after || !isWordChar(after));
  }

  function txnDedupKey(date, merchant, amount) {
    return `${date}|${normalize(merchant)}|${Number(amount).toFixed(2)}`;
  }

  function isoMinusDays(iso, days) {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() - days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function captureFrequency(text) {
    const t = normalize(text);
    if (t === "monthly") return "monthly";
    if (t === "yearly" || t === "annually" || t === "annual") return "annual";
    return null;
  }

  function flowForCaptureRow(row) {
    const cat = normalize(row.category);
    if (cat === "income") return "income";
    if (cat === "internal transfers" || cat === "savings transfer") return "internal_transfer";
    if (cat === "credit card payment") return "credit_card_payment";
    if (cat === "ignore") return "ignored";
    if (row.credit) return "refund_or_reversal";
    return "expense";
  }

  function rowDedupAmount(row) {
    const abs = Math.abs(row.amount);
    const flow = flowForCaptureRow(row);
    switch (flow) {
      case "income":
      case "refund_or_reversal":
        return -abs;
      case "expense":
        return abs;
      default:
        return row.credit ? -abs : abs;
    }
  }

  function resolveTxnScrollStopBefore(snapshot, extensionWatermark, bufferDays = SCROLL_BUFFER_DAYS) {
    const stops = [];
    if (extensionWatermark) stops.push(isoMinusDays(extensionWatermark, bufferDays));
    if (snapshot?.txnFastStopBefore) stops.push(snapshot.txnFastStopBefore);
    else if (snapshot?.txnNewestDate) stops.push(isoMinusDays(snapshot.txnNewestDate, bufferDays));
    else if (snapshot?.txnScrollStopBefore) stops.push(snapshot.txnScrollStopBefore);
    const normal = stops.length === 0 ? undefined : stops.sort()[stops.length - 1];
    // 回读请求（app 发现历史缺口时随快照带上）要求这一次滚过缺口起点，
    // 水位线在这里不作数——它只回答「新数据同步到哪」。
    if (snapshot?.txnBackfill?.from) {
      const backfillStop = isoMinusDays(snapshot.txnBackfill.from, bufferDays);
      if (!normal || backfillStop < normal) return backfillStop;
    }
    return normal;
  }

  function filterNewCaptureTxnRows(rows, snapshot, _source) {
    if (!snapshot?.txnKeys?.length && !snapshot?.pendingPlatformIds?.length)
      return { rows, skippedDuplicate: 0 };
    const remaining = new Map();
    for (const k of snapshot?.txnKeys ?? []) {
      remaining.set(k, (remaining.get(k) ?? 0) + 1);
    }
    // app 侧仍为 pending 的行（FINC.PENDING.1）：无论页面上还是 Pending 还是已 posted,
    // 都必须放行——它们是待转正/待刷新的更新,键相同也不算重复。
    const pendingIds = new Set(snapshot?.pendingPlatformIds ?? []);
    const out = [];
    let skippedDuplicate = 0;
    for (const row of rows) {
      if (row.pending) {
        out.push(row);
        continue;
      }
      if (row.platformId && pendingIds.has(row.platformId)) {
        out.push(row);
        continue;
      }
      const key = txnDedupKey(row.date, row.merchant, rowDedupAmount(row));
      const left = remaining.get(key) ?? 0;
      if (left > 0) {
        remaining.set(key, left - 1);
        skippedDuplicate += 1;
        continue;
      }
      out.push(row);
    }
    return { rows: out, skippedDuplicate };
  }

  function recurringRowAlreadyInApp(row, snapshot) {
    if (!snapshot?.cashFlows?.length) return false;
    const expenses = snapshot.cashFlows.filter((c) => c.type === "expense");
    const freq = captureFrequency(row.frequency);
    if (!freq) return false;
    const matched = expenses.filter((c) => nameMatches(c.name, row.name));
    if (matched.length !== 1) return false;
    const target = matched[0];
    return target.frequency === freq && Math.abs(target.amount - row.amount) < 0.5;
  }

  function accountRowUnchangedInApp(row, snapshot) {
    if (!snapshot?.accounts?.length) return false;
    const target = snapshot.accounts.find(
      (a) =>
        nameMatches(a.name, row.name) ||
        (row.institution && nameMatches(a.name, row.institution))
    );
    if (!target || target.balanceManual) return false;
    const next = Math.abs(row.balance);
    const epsilon = row.approximate
      ? Math.max(BALANCE_EPSILON, next * 0.006)
      : BALANCE_EPSILON;
    return Math.abs(target.balance - next) < epsilon;
  }

  function filterAccountRows(rows, snapshot) {
    const out = [];
    let skipped = 0;
    for (const row of rows) {
      if (accountRowUnchangedInApp(row, snapshot)) skipped += 1;
      else out.push(row);
    }
    return { rows: out, skipped };
  }

  function filterRecurringRows(rows, snapshot) {
    const out = [];
    let skipped = 0;
    for (const row of rows) {
      if (recurringRowAlreadyInApp(row, snapshot)) skipped += 1;
      else out.push(row);
    }
    return { rows: out, skipped };
  }

  window.FOS_PLAN = {
    txnDedupKey,
    resolveTxnScrollStopBefore,
    filterNewCaptureTxnRows,
    filterAccountRows,
    filterRecurringRows,
    recurringRowAlreadyInApp,
    accountRowUnchangedInApp,
  };
})();
