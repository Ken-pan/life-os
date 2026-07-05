import { describe, expect, it } from "vitest";
import { flattenMessageKeys } from "./translate";
import { zhCN, enUS } from "./messages";

describe("i18n messages", () => {
  it("zh-CN and en-US have the same keys", () => {
    const zhKeys = flattenMessageKeys(zhCN);
    const enKeys = flattenMessageKeys(enUS);
    expect(enKeys).toEqual(zhKeys);
  });
});
