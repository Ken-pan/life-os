(function initFinanceUI(global) {
  "use strict";

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function ensureGoalControls(container, opts) {
    if (!container) return null;
    let root = container.querySelector(".goal-controls");
    if (!root) {
      root = document.createElement("div");
      root.className = "goal-controls d-flex flex-wrap gap-2 align-items-end mt-2";
      root.innerHTML = `
        <label class="small text-secondary mb-0 d-flex flex-column">
          <span class="mb-1">${opts.amountLabel}</span>
          <input type="number" class="form-control form-control-sm" id="goalTargetAmountInput" min="0" step="10000" />
        </label>
        <label class="small text-secondary mb-0 d-flex flex-column">
          <span class="mb-1">${opts.yearLabel}</span>
          <input type="number" class="form-control form-control-sm" id="goalTargetYearInput" min="1" max="40" step="1" />
        </label>
      `;
      container.appendChild(root);
    }
    return root;
  }

  function syncGoalControls(container, opts) {
    const root = ensureGoalControls(container, opts);
    if (!root) return;
    const amountInput = root.querySelector("#goalTargetAmountInput");
    const yearInput = root.querySelector("#goalTargetYearInput");
    if (!amountInput || !yearInput) return;
    amountInput.value = String(Math.round(Number(opts.goal?.targetAmount) || 0));
    yearInput.value = String(Math.round(Number(opts.goal?.targetYear) || 20));
    if (!amountInput.dataset.bound) {
      amountInput.dataset.bound = "1";
      amountInput.addEventListener("input", () => {
        const v = Number(amountInput.value);
        opts.onGoalChange?.({
          targetAmount: Number.isFinite(v) && v >= 0 ? v : 0,
          targetYear: Number(yearInput.value) || 20
        });
      });
    }
    if (!yearInput.dataset.bound) {
      yearInput.dataset.bound = "1";
      yearInput.addEventListener("input", () => {
        const y = clamp(Math.round(Number(yearInput.value) || 20), 1, 40);
        opts.onGoalChange?.({
          targetAmount: Number(amountInput.value) || 0,
          targetYear: y
        });
      });
    }
  }

  function buildGoalHeadline(opts) {
    const privacy = Boolean(opts.privacyMode);
    const targetYear = Number(opts.targetYear) || 0;
    const expected = opts.expectedText || "$0";
    const target = opts.targetText || "$0";
    const gap = opts.gapText || "$0";
    const extra = opts.extraText || "$0";
    const i18n = opts.i18n || {};
    const prefixForecast = i18n.yearlyForecastPrefix || "预计净资产";
    const prefixTarget = i18n.targetPrefix || "目标";
    const prefixGap = i18n.gapPrefix || "缺口";
    const prefixExtra = i18n.extraSavingPrefix || "每月需多存";
    const suffix = i18n.reachableSuffix || "可达标";
    return `${targetYear}年 ${prefixForecast} ${expected} / ${prefixTarget} ${target} / ${prefixGap} ${gap} / ${prefixExtra} ${extra}${opts.extraReachable ? ` ${suffix}` : ""}${privacy ? "（隐私模式）" : ""}`;
  }

  function ensureTimelinePanel() {
    const body = document.getElementById("timelinePanelBody");
    if (!body) return null;
    if (!body.querySelector("#timelineEventForm")) {
      body.innerHTML = `
        <form id="timelineEventForm" class="timeline-form row g-2 mb-3">
          <div class="col-12 col-md-3">
            <label class="form-label mb-1 small">事件名称</label>
            <input id="timelineLabelInput" type="text" class="form-control form-control-sm" placeholder="如：买车首付" required />
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label mb-1 small">年份</label>
            <input id="timelineYearInput" type="number" class="form-control form-control-sm" min="1" max="40" step="1" value="2" required />
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label mb-1 small">类型</label>
            <select id="timelineKindInput" class="form-select form-select-sm">
              <option value="one-time">一次性</option>
              <option value="recurring">持续</option>
              <option value="ramp">递增</option>
            </select>
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label mb-1 small">金额</label>
            <input id="timelineAmountInput" type="number" class="form-control form-control-sm" step="100" value="10000" required />
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label mb-1 small">资金来源</label>
            <select id="timelineFundingInput" class="form-select form-select-sm">
              <option value="cash">现金</option>
              <option value="sell-invest">卖出投资</option>
              <option value="loan">贷款</option>
            </select>
          </div>
          <div class="col-12 col-md-1 d-grid">
            <label class="form-label mb-1 small opacity-0">提交</label>
            <button type="submit" class="btn btn-sm btn-primary">添加</button>
          </div>
        </form>
        <div id="timelineQuickBooks" class="timeline-quick-books d-flex flex-wrap gap-2 mb-3"></div>
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th scope="col">启用</th>
                <th scope="col">年份</th>
                <th scope="col">事件</th>
                <th scope="col">类型</th>
                <th scope="col">金额</th>
                <th scope="col">来源</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody id="timelineEventsBody"></tbody>
          </table>
        </div>
      `;
    }
    return body;
  }

  function renderTimelineQuickBooks(opts) {
    const root = document.getElementById("timelineQuickBooks");
    if (!root) return;
    const items = opts.quickBooks || [];
    root.innerHTML = items
      .map(
        (item) =>
          `<button type="button" class="btn btn-sm btn-outline-secondary timeline-quick-btn" data-template="${item.id}">${item.label}</button>`
      )
      .join("");
    root.querySelectorAll(".timeline-quick-btn").forEach((btn) => {
      btn.addEventListener("click", () => opts.onQuickBook?.(btn.dataset.template));
    });
  }

  function renderTimelineEvents(opts) {
    const body = document.getElementById("timelineEventsBody");
    if (!body) return;
    const rows = Array.isArray(opts.events) ? opts.events : [];
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="7" class="text-secondary">还没有事件。先用上方表单 book 一个未来支出点。</td></tr>`;
      return;
    }
    body.innerHTML = rows
      .slice()
      .sort((a, b) => a.year - b.year)
      .map((e) => {
        const funding = typeof e.fundingSource === "string" ? e.fundingSource : "loan";
        return `
          <tr data-event-id="${e.id}">
            <td><input class="form-check-input timeline-toggle" type="checkbox" ${e.enabled !== false ? "checked" : ""} /></td>
            <td>Y${e.year}</td>
            <td>${e.label}</td>
            <td>${e.kind}</td>
            <td>${opts.formatMoney ? opts.formatMoney(e.amount) : e.amount}</td>
            <td>${funding}</td>
            <td><button type="button" class="btn btn-sm btn-outline-danger timeline-delete">删除</button></td>
          </tr>
        `;
      })
      .join("");

    body.querySelectorAll("tr[data-event-id]").forEach((row) => {
      const id = row.getAttribute("data-event-id");
      row.querySelector(".timeline-toggle")?.addEventListener("change", (ev) => {
        opts.onToggle?.(id, ev.target.checked);
      });
      row.querySelector(".timeline-delete")?.addEventListener("click", () => {
        opts.onDelete?.(id);
      });
    });
  }

  global.FinanceUI = {
    ensureGoalControls,
    syncGoalControls,
    buildGoalHeadline,
    ensureTimelinePanel,
    renderTimelineEvents,
    renderTimelineQuickBooks
  };
})(window);
