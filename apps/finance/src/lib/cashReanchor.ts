import { planCashReanchorTargets } from "../engine/reconciliation";
import { insertBalanceAssertions } from "./repo";
import type { Account, BalanceAssertion } from "../types";

export const EXTENSION_REANCHOR_NOTE = "扩展同步自动校准";
export const MANUAL_ALIGN_NOTE = "一键校准";

export async function reanchorCashAccounts(input: {
  accounts: Account[];
  accountIds?: Set<string>;
  assertionDate: string;
  note?: string;
}): Promise<BalanceAssertion[]> {
  const targets = planCashReanchorTargets(input);
  if (targets.length === 0) return [];
  return insertBalanceAssertions(
    targets.map((t) => ({
      accountId: t.accountId,
      date: t.date,
      amount: t.amount,
      note: input.note ?? EXTENSION_REANCHOR_NOTE,
    }))
  );
}
