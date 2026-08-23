const unsafeFormulaPrefix = /^[=+\-@\t\r]/u;
const invalidXmlControls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu;

export function safeSpreadsheetText(value: string): string {
  const normalized = value.replace(invalidXmlControls, "");
  return unsafeFormulaPrefix.test(normalized) ? `'${normalized}` : normalized;
}

export function safeOptionalSpreadsheetText(value: string | null): string | null {
  return value === null ? null : safeSpreadsheetText(value);
}
