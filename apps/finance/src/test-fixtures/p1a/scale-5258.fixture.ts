/**
 * 5,258-row synthetic CSV fixture generator.
 * No real merchant/account identifiers are used.
 */
export function buildScale5258Csv(): string {
  const lines = ["Date,Amount,Description,Category,Account"];
  const merchants = ["GROCERY_X", "UTILITY_X", "SUBSCRIPTION_X", "FUEL_X", "PAYROLL_X"];
  for (let i = 0; i < 5258; i += 1) {
    const y = 2024 + Math.floor(i / 1400);
    const m = String((i % 12) + 1).padStart(2, "0");
    const d = String((i % 28) + 1).padStart(2, "0");
    const merchant = merchants[i % merchants.length];
    const isIncome = i % 17 === 0;
    const amount = isIncome ? 2800 + (i % 5) * 50 : -(8 + (i % 90) * 1.13);
    const category = isIncome ? "Income" : i % 6 === 0 ? "Housing > Rent" : "Synthetic > Expense";
    const account = i % 3 === 0 ? "Checking-A" : i % 3 === 1 ? "Checking-B" : "Credit-A";
    lines.push(`${y}-${m}-${d},${amount.toFixed(2)},${merchant},${category},${account}`);
  }
  return `${lines.join("\n")}\n`;
}
