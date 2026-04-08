/**
 * Migration 065: Restructure brand_context colors and fonts
 *
 * Transforms legacy JSON shapes into structured semantic objects:
 * - colors: [{label:"primary",value:"#fff"},...] → {"primary":"#fff",...}
 * - fonts: [{name:"Inter",role:"heading"},...] → {"heading":"Inter",...}
 *
 * Idempotent — skips rows that are already in the new format.
 */
import type { Kysely } from "kysely";
import { sql } from "kysely";

const COLOR_ROLES = new Set([
  "primary",
  "secondary",
  "accent",
  "background",
  "foreground",
]);

const FONT_ROLE_MAP: Record<string, string> = {
  heading: "heading",
  headings: "heading",
  head: "heading",
  title: "heading",
  body: "body",
  primary: "body",
  text: "body",
  code: "code",
  monospace: "code",
  mono: "code",
};

function transformColors(raw: unknown): string | null {
  if (!raw) return null;

  // Already structured object with known keys
  if (!Array.isArray(raw) && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Object.keys(obj).some((k) => COLOR_ROLES.has(k))) {
      const result: Record<string, string> = {};
      for (const role of COLOR_ROLES) {
        if (typeof obj[role] === "string") result[role] = obj[role] as string;
      }
      return Object.keys(result).length > 0 ? JSON.stringify(result) : null;
    }
    // Legacy Record<string,string>
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string" && COLOR_ROLES.has(key.toLowerCase())) {
        result[key.toLowerCase()] = value;
      }
    }
    return Object.keys(result).length > 0 ? JSON.stringify(result) : null;
  }

  // Legacy array
  if (Array.isArray(raw)) {
    const result: Record<string, string> = {};
    for (const item of raw) {
      const entry = item as Record<string, unknown>;
      const label = (entry.label as string)?.toLowerCase?.();
      const value = entry.value as string;
      if (label && value && COLOR_ROLES.has(label)) {
        result[label] = value;
      }
    }
    return Object.keys(result).length > 0 ? JSON.stringify(result) : null;
  }

  return null;
}

function transformFonts(raw: unknown): string | null {
  if (!raw) return null;

  // Already structured
  if (!Array.isArray(raw) && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (
      typeof obj.heading === "string" ||
      typeof obj.body === "string" ||
      typeof obj.code === "string"
    ) {
      return JSON.stringify(obj);
    }
    return null;
  }

  // Legacy array
  if (Array.isArray(raw)) {
    const result: Record<string, string> = {};
    for (const item of raw) {
      const entry = item as Record<string, unknown>;
      const name =
        (entry.name as string) ?? (entry.family as string) ?? undefined;
      const role = (entry.role as string)?.toLowerCase?.() ?? "";
      if (!name) continue;
      const mapped = FONT_ROLE_MAP[role];
      if (mapped && !result[mapped]) {
        result[mapped] = name;
      } else if (!result.body) {
        result.body = name;
      }
    }
    return Object.keys(result).length > 0 ? JSON.stringify(result) : null;
  }

  return null;
}

export async function up(db: Kysely<unknown>): Promise<void> {
  const rows = await sql<{
    id: string;
    colors: string | null;
    fonts: string | null;
  }>`SELECT id, colors, fonts FROM brand_context`.execute(db);

  for (const row of rows.rows) {
    let colorsChanged = false;
    let fontsChanged = false;
    let newColors: string | null = row.colors;
    let newFonts: string | null = row.fonts;

    if (row.colors) {
      try {
        const parsed = JSON.parse(row.colors);
        // Only transform if it's an array (legacy format)
        if (Array.isArray(parsed)) {
          newColors = transformColors(parsed);
          colorsChanged = true;
        }
      } catch {
        // skip unparseable
      }
    }

    if (row.fonts) {
      try {
        const parsed = JSON.parse(row.fonts);
        if (Array.isArray(parsed)) {
          newFonts = transformFonts(parsed);
          fontsChanged = true;
        }
      } catch {
        // skip unparseable
      }
    }

    if (colorsChanged || fontsChanged) {
      await sql`
        UPDATE brand_context
        SET
          colors = ${newColors},
          fonts = ${newFonts},
          updated_at = NOW()
        WHERE id = ${row.id}
      `.execute(db);
    }
  }
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // Data transformation is not reversible — old format data is lost
}
