import { describe, expect, it } from "vitest";
import { resolveCardPortal, resolveCardPortalFromBillLabel } from "./cardPortals";

describe("resolveCardPortal", () => {
  const cards = [
    { name: "Apple Card", url: "https://card.apple.com/" },
    { name: "Bank of America ····8410", url: "https://www.bankofamerica.com/" },
    { name: "Best Buy - Citi Card ····7848", url: "https://online.citi.com/US/login.do" },
    { name: "Chase ····9228", url: "https://www.chase.com/paycard" },
    { name: "Discover ····4256", url: "https://www.discover.com/login/" },
    { name: "Robinhood ····3838", url: "https://robinhood.com/login" },
    { name: "Target REDCard ····1600", url: "https://www.target.com/mycirclecard" },
    { name: "Wells Fargo ····2507", url: "https://connect.secure.wellsfargo.com/auth/login/present" },
    { name: "Wells Fargo ····4164", url: "https://connect.secure.wellsfargo.com/auth/login/present" },
  ] as const;

  it.each(cards)("matches $name", ({ name, url }) => {
    const portal = resolveCardPortal({ type: "credit-card", name });
    expect(portal?.url).toBe(url);
  });

  it("ignores non credit-card accounts", () => {
    expect(resolveCardPortal({ type: "checking", name: "Chase Checking" })).toBeNull();
  });

  it("returns null for unknown issuer", () => {
    expect(resolveCardPortal({ type: "credit-card", name: "Mystery Card" })).toBeNull();
  });
});

describe("resolveCardPortalFromBillLabel", () => {
  it("parses bill labels from daily outlook", () => {
    expect(resolveCardPortalFromBillLabel("Chase ····9228 账单")?.url).toBe(
      "https://www.chase.com/paycard"
    );
    expect(resolveCardPortalFromBillLabel("Apple Card 账单")?.url).toBe("https://card.apple.com/");
  });
});
