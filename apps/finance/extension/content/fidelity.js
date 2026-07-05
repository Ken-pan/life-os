// Fidelity 抓取（digital.fidelity.com）。
//
// 1. Portfolio Summary 页（/ftgw/digital/portfolio/summary，2026-07 MHTML 实测）：
//    左侧账户选择器 .acct-selector__acct-wrapper 每行 = 账户名 + 账号 + 全精度余额，
//    分组名（Retirement / Health savings）在包含行的 <section aria-label> 上。
//    → 抓成 "accounts" capture（逐账户余额）。
// 2. Positions 页（ag-grid）：每行 symbol / 数量 / 现价 / 市值 → "holdings" capture。
//    该页无本地样本，选择器带多级兜底；抓不到时看 DevTools [FOS] 日志提示。

(() => {
  const { parseMoney, makeEnvelope, enqueue, captureWhenStable, onUrlChange } = window.FOS;

  const NON_POSITION_SYMBOLS = new Set(["SPAXX", "FDRXX", "FCASH", "CORE"]);

  function textOf(el) {
    return el ? el.textContent.trim() : "";
  }

  /** 策略 1：ag-grid 行（Fidelity Positions 页主表）。 */
  function readAgGridPositions() {
    const rows = document.querySelectorAll(".ag-center-cols-container .ag-row, .ag-row");
    const out = [];
    for (const row of rows) {
      // symbol 单元格：posweb-cell-symbol* 或 col-id 含 symbol 的 cell。
      const symEl =
        row.querySelector('[class*="symbol-name"]') ??
        row.querySelector('[col-id*="symbol" i]') ??
        row.querySelector('[col-id="sym"]');
      const symText = textOf(symEl);
      const symMatch = symText.match(/^([A-Z][A-Z0-9.]{0,9})\b/);
      if (!symMatch) continue;
      const ticker = symMatch[1];

      const cells = [...row.querySelectorAll('[role="gridcell"], .ag-cell')];
      const nums = cells
        .map((c) => ({ text: textOf(c), value: parseMoney(textOf(c)) }))
        .filter((c) => c.value != null);

      // 数量列：col-id 含 qty/quantity；否则用「无 $ 符号的数值」推断。
      const qtyEl = row.querySelector('[col-id*="qty" i], [col-id*="quantity" i]');
      let shares = qtyEl ? parseMoney(textOf(qtyEl)) : null;
      if (shares == null) {
        const plain = nums.find((c) => !c.text.includes("$") && !c.text.includes("%"));
        shares = plain?.value ?? null;
      }

      const priceEl = row.querySelector('[col-id*="price" i], [col-id*="lstprc" i]');
      const price = priceEl ? parseMoney(textOf(priceEl)) : null;
      const valueEl = row.querySelector('[col-id*="value" i], [col-id*="curval" i], [col-id*="mktval" i]');
      const marketValue = valueEl ? parseMoney(textOf(valueEl)) : null;

      if (shares == null || shares <= 0) continue;
      if (price == null && marketValue == null) continue;
      out.push({
        ticker,
        securityName: symText.replace(ticker, "").trim() || undefined,
        shares,
        price: price ?? (marketValue != null ? marketValue / shares : 0),
        marketValue: marketValue ?? undefined,
      });
    }
    return out;
  }

  /** 账户/组合总值：优先取带 balance 语义的元素，退回页面上最大的 $ 金额标题。 */
  function readTotalValue() {
    const candidates = document.querySelectorAll(
      '[class*="total-value" i], [class*="acct-balance" i], [class*="portfolio-value" i], [data-testid*="balance" i]'
    );
    for (const el of candidates) {
      const v = parseMoney(textOf(el));
      if (v != null && v > 0) return v;
    }
    return null;
  }

  function probe() {
    const positions = readAgGridPositions().filter(
      (p) => !NON_POSITION_SYMBOLS.has(p.ticker)
    );
    if (positions.length === 0) return null;
    return { positions, totalValue: readTotalValue() ?? undefined };
  }

  // ---------- Portfolio Summary：账户选择器（逐账户全精度余额） ----------

  /** 分组标题（section aria-label）→ financeOS 账户类型提示。 */
  const GROUP_KIND = [
    [/retirement|401k|403b|ira/i, "retirement"],
    [/health/i, "hsa"],
    [/investment|brokerage|individual/i, "brokerage"],
  ];

  function probeSummaryAccounts() {
    const wrappers = document.querySelectorAll(".acct-selector__acct-wrapper");
    const rows = [];
    for (const w of wrappers) {
      const name = textOf(w.querySelector(".acct-selector__acct-name"));
      // 余额 span 里混着 sr-only 的 ", balance: " 前缀，取带 $ 的那个数。
      const balText = textOf(w.querySelector(".acct-selector__acct-balance"))
        .replace(/,?\s*balance:\s*/i, "");
      const balance = parseMoney(balText);
      if (!name || balance == null) continue;
      const group = w.closest("section")?.getAttribute("aria-label") ?? "";
      const kindHint = GROUP_KIND.find(([re]) => re.test(group))?.[1];
      rows.push({ name, balance, kindHint, institution: "Fidelity" });
    }
    return rows.length > 0 ? rows : null;
  }

  let lastSent = null;
  let lastAccountsSig = null;
  let cancels = [];

  function startCapture() {
    for (const c of cancels) c();
    cancels = [];
    if (!/portfolio|positions|summary/i.test(location.href)) return;

    // 持仓表（Positions 页才有 ag-grid；Summary 页 probe 返回 null 不影响）。
    cancels.push(captureWhenStable({
      probe,
      capture: (result) => {
        const sig = JSON.stringify(result.positions.map((p) => [p.ticker, p.shares]));
        if (sig === lastSent) return;
        lastSent = sig;
        enqueue(
          makeEnvelope("fidelity", "holdings", {
            institution: "Fidelity",
            accountLabel: "Fidelity portfolio",
            totalValue: result.totalValue,
            positions: result.positions,
          })
        ).then(() =>
          console.info(`[FOS] Fidelity 持仓已抓取：${result.positions.length} 只`)
        );
      },
    }));

    // 账户余额（Summary / Positions 页左侧都有账户选择器）。
    cancels.push(captureWhenStable({
      probe: probeSummaryAccounts,
      capture: (accounts) => {
        const sig = JSON.stringify(accounts);
        if (sig === lastAccountsSig) return;
        lastAccountsSig = sig;
        enqueue(makeEnvelope("fidelity", "accounts", { accounts })).then(() =>
          console.info(`[FOS] Fidelity 账户余额已抓取：${accounts.length} 个`)
        );
      },
    }));
  }

  startCapture();
  onUrlChange(() => startCapture());

  // 诊断：10 秒后两类都没抓到时提示（仅打印一次）。
  setTimeout(() => {
    if (!lastSent && !lastAccountsSig && /portfolio|positions|summary/i.test(location.href)) {
      console.info(
        "[FOS] Fidelity：未识别到持仓表或账户列表。若当前确实在 Portfolio 页，说明 DOM 结构与预期不符，" +
          "请把页面另存为 MHTML 发给开发者更新 extension/content/fidelity.js 选择器。"
      );
    }
  }, 10000);
})();
