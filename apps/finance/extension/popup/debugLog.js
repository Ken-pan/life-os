// Korben Money Sync — debug log 导出（Agent 友好结构）。
(() => {
  const SCHEMA = "finance-os-sync-debug/v2";

  const PHASE_LABEL = {
    starting: "启动",
    dashboard: "Dashboard 余额",
    networth: "Net Worth 账户",
    recurring: "Recurring 订阅",
    transactions: "Transactions 交易",
    done: "完成",
    error: "失败",
  };

  function asText(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.message || String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function pickErrorFields(entry) {
    const extra = entry?.extra ?? {};
    return {
      message: entry?.message ?? extra.message,
      code: extra.code ?? entry?.code,
      stack: extra.stack ?? entry?.stack,
      name: extra.name ?? entry?.name,
      error: extra.error,
    };
  }

  function buildTimelineEntries(log) {
    if (!Array.isArray(log?.entries)) return [];
    return log.entries.map((e, index) => ({
      seq: index + 1,
      at: e.at,
      elapsedMs: e.elapsedMs,
      phase: e.phase,
      phaseLabel: PHASE_LABEL[e.phase] ?? e.phase,
      level: e.level,
      message: e.message,
      url: e.url,
      extra: e.extra ?? null,
      ...pickErrorFields(e),
    }));
  }

  function buildErrorEntries(timeline) {
    return timeline.filter((e) => e.level === "error" || e.level === "warn");
  }

  function groupTimelineByPhase(timeline) {
    const phases = {};
    for (const entry of timeline) {
      const key = entry.phase ?? "unknown";
      if (!phases[key]) {
        phases[key] = {
          phase: key,
          label: entry.phaseLabel ?? key,
          entries: [],
          warnCount: 0,
          errorCount: 0,
        };
      }
      phases[key].entries.push(entry);
      if (entry.level === "warn") phases[key].warnCount += 1;
      if (entry.level === "error") phases[key].errorCount += 1;
    }
    return phases;
  }

  function summarizeCapture(capture) {
    const d = capture?.data ?? {};
    if (capture?.kind === "holdings") {
      const positions = d.positions ?? [];
      return {
        count: positions.length,
        detail: positions.slice(0, 5).map((p) => ({
          ticker: p.ticker,
          shares: p.shares,
          averageCostPerShare: p.averageCostPerShare,
        })),
        truncated: positions.length > 5,
      };
    }
    if (capture?.kind === "accounts") {
      const accounts = d.accounts ?? [];
      return {
        count: accounts.length,
        detail: accounts.slice(0, 8).map((a) => ({
          name: a.name,
          balance: a.balance,
          institution: a.institution,
          approximate: a.approximate,
        })),
        truncated: accounts.length > 8,
      };
    }
    if (capture?.kind === "transactions") {
      return {
        count: (d.rows ?? []).length,
        complete: d.complete,
        oldest: (d.rows ?? []).slice(-1)[0]?.date,
        newest: (d.rows ?? [])[0]?.date,
      };
    }
    if (capture?.kind === "recurring") {
      return { count: (d.rows ?? []).length };
    }
    return { count: 0 };
  }

  function buildDiagnosis(ctx) {
    const issues = [];
    const suggestedNextSteps = [];
    const { crawlState, perf, dlq, inFlight, queue, rhEnrich, snapshot, errors } = ctx;

    if (crawlState?.phase === "error") {
      issues.push({
        severity: "error",
        code: "CRAWL_FAILED",
        phase: "error",
        message: asText(crawlState.detail) || "主动抓取以 error 阶段结束",
        hint: "查看 errors 数组与 performance.lastRun.summary.stack",
      });
      suggestedNextSteps.push("检查 crawl.state.detail 与 errors 中带 stack 的条目");
    }

    if (crawlState?.phase && crawlState.phase !== "done" && crawlState.phase !== "error") {
      const staleMs = crawlState.at ? Date.now() - crawlState.at : null;
      if (staleMs != null && staleMs > 30_000) {
        issues.push({
          severity: "warn",
          code: "CRAWL_STALE",
          phase: crawlState.phase,
          message: `抓取可能卡住：阶段「${PHASE_LABEL[crawlState.phase] ?? crawlState.phase}」已 ${Math.round(staleMs / 1000)}s 无更新`,
          hint: "查看 timeline 最后几条与 performance.lastRun.routeTimeouts / probeTimeouts",
        });
        suggestedNextSteps.push("确认 Rocket Money 标签页仍打开且已登录，必要时刷新后重试抓取");
      }
    }

    for (const pt of perf?.lastRun?.probeTimeouts ?? []) {
      issues.push({
        severity: "warn",
        code: "PROBE_TIMEOUT",
        phase: pt.phase,
        message: `${PHASE_LABEL[pt.phase] ?? pt.phase}：${pt.timeoutMs}ms 内未找到目标 DOM（path=${pt.path ?? "?"})`,
        hint: "页面可能未加载完、改版导致选择器失效，或需展开折叠区块",
        atMs: pt.atMs,
      });
    }

    for (const rt of perf?.lastRun?.routeTimeouts ?? []) {
      issues.push({
        severity: "warn",
        code: "ROUTE_TIMEOUT",
        phase: rt.path,
        message: `导航超时：目标 ${rt.path}，当前 ${rt.currentPath ?? "?"}`,
        hint: "侧栏链接可能不存在或 SPA 路由未切换成功",
        atMs: rt.atMs,
      });
    }

    for (const e of errors.filter((x) => x.level === "error")) {
      if (issues.some((i) => i.message === e.message && i.phase === e.phase)) continue;
      issues.push({
        severity: "error",
        code: e.code ?? "LOG_ERROR",
        phase: e.phase,
        message: e.message,
        stack: e.stack,
        hint: "见 timeline 同 seq 的 extra 字段",
        seq: e.seq,
      });
    }

    if ((dlq?.length ?? 0) > 0) {
      issues.push({
        severity: "error",
        code: "DLQ_NON_EMPTY",
        message: `${dlq.length} 条 capture 投递失败（DLQ）`,
        hint: "查看 sync.dlq 各条 reason；在 popup 可「全部重新入队」",
        items: dlq.slice(0, 5).map((d) => ({ id: d.id, reason: d.reason, source: d.source, kind: d.kind })),
      });
      suggestedNextSteps.push("打开 Korben Money 并确认 ExtensionSyncBridge 正常，然后重试 DLQ");
    }

    if ((inFlight?.length ?? 0) > 0 && (queue?.length ?? 0) > 0) {
      issues.push({
        severity: "warn",
        code: "INFLIGHT_STUCK",
        message: `${inFlight.length} 条投递中且队列仍有 ${queue.length} 条待同步`,
        hint: "Korben Money 页面可能未打开或未 ACK",
      });
      suggestedNextSteps.push("打开 Korben Money（localhost 或 Netlify）并查看右下角同步 toast");
    }

    if (rhEnrich?.failures?.length) {
      issues.push({
        severity: "warn",
        code: "RH_ENRICH_PARTIAL",
        message: `Robinhood 详情补齐失败 ticker：${rhEnrich.failures.join(", ")}`,
        hint: "确认 Chrome 已登录 Robinhood；可在 popup 手动重试补齐",
      });
    }

    if (!snapshot?.exportedAt) {
      issues.push({
        severity: "info",
        code: "NO_APP_SNAPSHOT",
        message: "尚无 Korben Money 抓取计划快照",
        hint: "至少打开一次 Korben Money，扩展才能跳过已同步数据",
      });
    }

    const severity = issues.some((i) => i.severity === "error")
      ? "error"
      : issues.some((i) => i.severity === "warn")
        ? "warn"
        : issues.some((i) => i.severity === "info")
          ? "info"
          : "ok";

    const headline =
      severity === "ok"
        ? "未发现明显异常；抓取/同步链路看起来正常"
        : issues.find((i) => i.severity === "error")?.message ??
          issues.find((i) => i.severity === "warn")?.message ??
          issues[0]?.message ??
          "存在待排查项";

    if (suggestedNextSteps.length === 0 && severity !== "ok") {
      suggestedNextSteps.push("将本 JSON 发给 Agent，优先阅读 diagnosis 与 errors");
    }

    return {
      severity,
      headline,
      issueCount: issues.length,
      issues,
      suggestedNextSteps: [...new Set(suggestedNextSteps)],
    };
  }

  /**
   * @param {object} input — popup 从 storage + runtime 收集的原始数据
   */
  function buildDebugExport(input) {
    const manifest = input.manifest ?? {};
    const timeline = buildTimelineEntries(input.log);
    const errors = buildErrorEntries(timeline);
    const phases = groupTimelineByPhase(timeline);
    const lastRun = input.performance?.lastRun ?? null;

    const ctx = {
      crawlState: input.state,
      perf: input.performance,
      dlq: input.dlq ?? [],
      inFlight: input.inFlight ?? [],
      queue: input.queue ?? [],
      rhEnrich: input.rhEnrich,
      snapshot: input.snapshot,
      errors,
    };

    const diagnosis = buildDiagnosis(ctx);

    return {
      schema: SCHEMA,
      meta: {
        exportedAt: new Date().toISOString(),
        extension: {
          name: manifest.name ?? "Korben Money Sync",
          version: manifest.version ?? "unknown",
          manifestVersion: manifest.manifest_version ?? manifest.manifestVersion ?? 3,
        },
        exportSource: "popup",
        userAgent: input.userAgent ?? null,
        locale: input.locale ?? null,
        logRunId: input.log?.runId ?? input.state?.runId ?? lastRun?.runId ?? null,
      },
      diagnosis,
      crawl: {
        state: input.state ?? null,
        stateLabels: PHASE_LABEL,
        summary: lastRun?.summary ?? input.state?.stats ?? null,
        status: lastRun?.status ?? input.state?.phase ?? null,
        totalMs: lastRun?.totalMs ?? null,
      },
      errors: errors.map((e) => ({
        seq: e.seq,
        at: e.at,
        elapsedMs: e.elapsedMs,
        phase: e.phase,
        phaseLabel: e.phaseLabel,
        level: e.level,
        code: e.code,
        message: e.message,
        stack: e.stack,
        name: e.name,
        url: e.url,
        extra: e.extra,
      })),
      timeline,
      phases,
      performance: {
        lastRun,
        recentRuns: (input.performance?.recentRuns ?? []).slice(-5),
        phaseAverages: input.performance?.phaseAverages ?? null,
        probeTimeouts: lastRun?.probeTimeouts ?? [],
        routeTimeouts: lastRun?.routeTimeouts ?? [],
        transactionScroll: lastRun?.transactionScroll ?? null,
      },
      sync: {
        queue: (input.queue ?? []).map((c) => ({
          id: c.id,
          source: c.source,
          kind: c.kind,
          capturedAt: c.capturedAt,
          pageUrl: c.pageUrl,
          asOfDate: c.asOfDate,
          summary: summarizeCapture(c),
        })),
        dlq: (input.dlq ?? []).map((d) => ({
          id: d.id,
          source: d.source,
          kind: d.kind,
          reason: d.reason,
          dlqAt: d.dlqAt,
          capturedAt: d.capturedAt,
        })),
        inFlight: input.inFlight ?? [],
        lastSync: input.lastSync ?? null,
        txnWatermark: input.txnWatermark ?? null,
        rhEnrich: input.rhEnrich ?? null,
        rhDetailsCount: input.rhDetailsCount ?? 0,
        history: (input.history ?? []).slice(-10),
      },
      snapshot: input.snapshot
        ? {
            exportedAt: input.snapshot.exportedAt,
            privacyRedacted: input.snapshot.privacyRedacted,
            accountCount: input.snapshot.accounts?.length ?? 0,
            txnCount: input.snapshot.txnCount,
            txnNewestDate: input.snapshot.txnNewestDate,
            cashFlowCount: input.snapshot.cashFlows?.length ?? 0,
          }
        : null,
      environment: {
        tabs: input.tabs ?? [],
        rocketMoneyTabOpen: (input.tabs ?? []).some((t) => /rocketmoney\.com/i.test(t.url ?? "")),
        financeOsTabOpen: (input.tabs ?? []).some((t) => t.isFinanceOs === true),
      },
      agentGuide: {
        readOrder: [
          "1. diagnosis — 问题摘要与建议下一步",
          "2. errors — 所有 warn/error 条目（含 stack）",
          "3. crawl.state — 当前/最近抓取阶段与 detail",
          "4. performance.probeTimeouts / routeTimeouts — DOM/导航超时",
          "5. timeline — 完整时间线（按 seq 查上下文）",
          "6. sync.dlq / sync.inFlight — 投递失败或卡住",
        ],
        codes: {
          CRAWL_FAILED: "主动抓取异常终止",
          CRAWL_STALE: "抓取阶段长时间无进展",
          PROBE_TIMEOUT: "页面 DOM 探测超时（选择器/加载/折叠）",
          ROUTE_TIMEOUT: "SPA 路由跳转超时",
          DLQ_NON_EMPTY: "capture 多次投递未 ACK",
          INFLIGHT_STUCK: "队列有数据但 Korben Money 未确认",
          RH_ENRICH_PARTIAL: "Robinhood 后台详情补齐部分失败",
          NO_APP_SNAPSHOT: "未拉取 Korben Money 快照",
          CRAWL_EXCEPTION: "未捕获异常",
        },
      },
    };
  }

  window.FOS_DEBUG_LOG = { buildDebugExport, SCHEMA };
})();
