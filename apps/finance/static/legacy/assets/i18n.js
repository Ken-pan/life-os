(function initFinanceI18n(global) {
  "use strict";

  const zhCN = {
    goal: {
      amountLabel: "目标净资产",
      yearLabel: "目标年份",
      yearlyForecastPrefix: "预计净资产",
      targetPrefix: "目标",
      gapPrefix: "缺口",
      extraSavingPrefix: "每月需多存",
      reachableSuffix: "可达标",
      unreachable: "在当前假设上限内暂不可达"
    }
  };

  function t(path) {
    const keys = String(path || "").split(".");
    let cursor = zhCN;
    for (let i = 0; i < keys.length; i++) {
      cursor = cursor?.[keys[i]];
      if (cursor == null) return path;
    }
    return cursor;
  }

  global.FinanceI18n = {
    zhCN,
    t
  };
})(window);
