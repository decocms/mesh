export function generatePrefixedId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomUUID().replace(/-/g, "").substring(0, 8);
  return `${prefix}_${timestamp}${random}`;
}

export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64");
}

export function decodeCursor(cursor?: string): number | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf8");
    const offset = Number.parseInt(decoded, 10);
    return Number.isNaN(offset) || offset < 0 ? null : offset;
  } catch {
    return null;
  }
}

export function normalizeStringList(values?: string[]): string[] {
  if (!values?.length) return [];
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .map((value) => value.toLowerCase()),
    ),
  );
}

export function csvToList(value: string | null | undefined): string[] {
  if (!value) return [];
  return normalizeStringList(value.split(","));
}
