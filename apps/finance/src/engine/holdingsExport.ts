import type { SnapshotCompareResult } from "./holdingsPortfolio";

function csvCell(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cells: (string | number)[]): string {
  return cells.map(csvCell).join(",");
}

export function snapshotCompareToCsv(diff: SnapshotCompareResult, privacy: boolean): string {
  if (privacy) {
    return csvRow(["note", "隐私模式已开启，未导出金额"]) + "\n";
  }
  const lines: string[] = [];
  lines.push(
    csvRow([
      "older_snapshot",
      "newer_snapshot",
      "older_total",
      "newer_total",
      "total_delta",
    ])
  );
  lines.push(
    csvRow([
      diff.olderLabel,
      diff.newerLabel,
      diff.olderTotal.toFixed(2),
      diff.newerTotal.toFixed(2),
      diff.totalDelta.toFixed(2),
    ])
  );
  lines.push("");
  lines.push(csvRow(["ticker", "security_name", "older_value", "newer_value", "delta", "status"]));
  for (const row of diff.rows) {
    lines.push(
      csvRow([
        row.ticker,
        row.securityName,
        row.olderValue.toFixed(2),
        row.newerValue.toFixed(2),
        row.valueDelta.toFixed(2),
        row.status,
      ])
    );
  }
  return lines.join("\n") + "\n";
}

export function snapshotCompareFilename(diff: SnapshotCompareResult): string {
  const older = diff.olderLabel.replace(/[^\d-]/g, "").slice(0, 10) || "older";
  const newer = diff.newerLabel.replace(/[^\d-]/g, "").slice(0, 10) || "newer";
  return `holdings-compare-${older}-vs-${newer}.csv`;
}

export function downloadTextFile(filename: string, text: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
