import { describe, expect, it } from "vitest";
import {
  institutionLogoSrc,
  resolveInstitution,
  resolveInstitutionFromBillLabel,
  resolveInstitutionFromIssuer,
  resolveInstitutionFromSource,
} from "./institutionLogos";

describe("institutionLogos", () => {
  it("matches bank names from account labels", () => {
    expect(resolveInstitution("Chase Sapphire", "credit-card").id).toBe("chase");
    expect(resolveInstitution("Fidelity 401k", "retirement").id).toBe("fidelity");
  });

  it("falls back to account type when name is generic", () => {
    expect(resolveInstitution("My savings", "savings").id).toBe("savings");
  });

  it("resolves issuers and sync sources", () => {
    expect(resolveInstitutionFromIssuer("Amex")?.id).toBe("amex");
    expect(resolveInstitutionFromSource("fidelity")?.id).toBe("fidelity");
  });

  it("parses bill labels", () => {
    expect(resolveInstitutionFromBillLabel("Chase 账单")?.id).toBe("chase");
  });

  it("builds logo asset paths", () => {
    expect(institutionLogoSrc("chase")).toBe("/assets/institutions/chase.svg");
  });
});
