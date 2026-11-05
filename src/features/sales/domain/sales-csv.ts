import { safeSpreadsheetText } from "@/features/exports/domain/spreadsheet-safety";

export function encodeSalesCsv(rows: (string | number)[][]) {
  return "\uFEFF" + rows.map(row => row.map(v => `"${safeSpreadsheetText(String(v).replace(/^\s+(?=[=+@-])/u, "")).replaceAll('"', '""')}"`).join(",")).join("\r\n");
}
