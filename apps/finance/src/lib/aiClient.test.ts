import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  clearAiTextCache,
  ensureAiText,
  getCachedAiText,
  parseBullets,
  parseBriefSections,
  shouldRegenerate,
  SOFT_TTL_MS,
  MIN_REGEN_INTERVAL_MS,
  FAIL_COOLDOWN_MS,
} from "./aiClient";

const NOW = 1_800_000_000_000;

describe("shouldRegenerate", () => {
  const cached = { text: "x", generatedAt: NOW - 1000, fingerprint: "fp1" };

  it("无缓存时需要生成", () => {
    expect(shouldRegenerate(null, "fp1", NOW, null)).toBe(true);
  });

  it("缓存新鲜且指纹一致时不生成", () => {
    expect(shouldRegenerate(cached, "fp1", NOW, null)).toBe(false);
  });

  it("超过软 TTL 后重新生成", () => {
    const old = { ...cached, generatedAt: NOW - SOFT_TTL_MS - 1 };
    expect(shouldRegenerate(old, "fp1", NOW, null)).toBe(true);
  });

  it("指纹变化但间隔太短时先不生成（防抖）", () => {
    expect(shouldRegenerate(cached, "fp2", NOW, null)).toBe(false);
  });

  it("指纹变化且超过最小间隔时重新生成", () => {
    const old = { ...cached, generatedAt: NOW - MIN_REGEN_INTERVAL_MS - 1 };
    expect(shouldRegenerate(old, "fp2", NOW, null)).toBe(true);
  });

  it("失败冷却期内不自动重试", () => {
    expect(shouldRegenerate(null, "fp1", NOW, NOW - FAIL_COOLDOWN_MS + 1000)).toBe(false);
    expect(shouldRegenerate(null, "fp1", NOW, NOW - FAIL_COOLDOWN_MS - 1000)).toBe(true);
  });
});

describe("ensureAiText", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("成功时写入缓存并返回文本", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ text: "- 建议一\n- 建议二" }), { status: 200 })
      )
    );
    const r = await ensureAiText({ kind: "t1", system: "s", user: "u", fingerprint: "fp" });
    expect(r?.text).toBe("- 建议一\n- 建议二");
    expect(getCachedAiText("t1")?.fingerprint).toBe("fp");
  });

  it("缓存新鲜时不发请求", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem(
      "finance_os_ai_v1:zh-CN:t2",
      JSON.stringify({ v: 1, text: "旧内容", generatedAt: Date.now(), fingerprint: "fp" })
    );
    const r = await ensureAiText({ kind: "t2", system: "s", user: "u", fingerprint: "fp" });
    expect(r?.text).toBe("旧内容");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("失败时回退旧缓存并记录冷却，不缓存错误", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oops", { status: 502 })));
    localStorage.setItem(
      "finance_os_ai_v1:zh-CN:t3",
      JSON.stringify({ v: 1, text: "旧内容", generatedAt: 1, fingerprint: "old" })
    );
    const r = await ensureAiText({ kind: "t3", system: "s", user: "u", fingerprint: "new" });
    expect(r?.text).toBe("旧内容");
    expect(getCachedAiText("t3")?.fingerprint).toBe("old");
    expect(localStorage.getItem("finance_os_ai_fail_v1:zh-CN:t3")).not.toBeNull();
  });

  it("服务端未配置（501）时标记禁用", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 501 })));
    await ensureAiText({ kind: "t4", system: "s", user: "u", fingerprint: "fp" });
    expect(localStorage.getItem("finance_os_ai_disabled_v1")).toBe("1");
  });

  it("并发同 kind 只发一次请求（单飞）", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "ok" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([
      ensureAiText({ kind: "t5", system: "s", user: "u", fingerprint: "fp" }),
      ensureAiText({ kind: "t5", system: "s", user: "u", fingerprint: "fp" }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("clearAiTextCache", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("清除指定 kind 的缓存", () => {
    localStorage.setItem(
      "finance_os_ai_v1:zh-CN:today",
      JSON.stringify({ v: 1, text: "x", generatedAt: 1, fingerprint: "fp" })
    );
    clearAiTextCache("today");
    expect(getCachedAiText("today")).toBeNull();
  });
});

describe("parseBullets", () => {
  it("容忍多种前缀并过滤空行", () => {
    expect(parseBullets("- 一\n• 二\n3. 三\n\n* 四")).toEqual(["一", "二", "三", "四"]);
  });
});

describe("parseBriefSections", () => {
  it("解析风险/建议/异常三段", () => {
    expect(
      parseBriefSections("风险：Chase 账单将到期\n建议：今天暂停大额消费\n异常：Groceries 占比偏高")
    ).toEqual({
      risk: "Chase 账单将到期",
      suggest: "今天暂停大额消费",
      anomaly: "Groceries 占比偏高",
    });
  });

  it("忽略「无」段落", () => {
    expect(parseBriefSections("风险：无\n建议：保持节奏\n异常：无")).toEqual({
      suggest: "保持节奏",
    });
  });

  it("旧 bullet 格式回退到建议", () => {
    expect(parseBriefSections("- 一\n- 二")).toEqual({ suggest: "一；二" });
  });

  it("解析英文 Risk/Suggestion/Anomaly 三段", () => {
    expect(
      parseBriefSections(
        "Risk: Amex bill due soon\nSuggestion: Move cash today\nAnomaly: Coffee spend is high"
      )
    ).toEqual({
      risk: "Amex bill due soon",
      suggest: "Move cash today",
      anomaly: "Coffee spend is high",
    });
  });
});
