export function canonicalize(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function canonical(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map((v) => (v === undefined ? null : canonical(v)));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      out[k] = canonical(obj[k]);
    }
    return out;
  }
  return value;
}
