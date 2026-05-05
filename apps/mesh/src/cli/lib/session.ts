import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface Session {
  target: string;
  workspace: string;
  user: { id: string; email: string };
  token: string;
  createdAt: string;
}

export function sessionPath(dataDir: string): string {
  return join(dataDir, "session.json");
}

export async function readSession(dataDir: string): Promise<Session | null> {
  try {
    const raw = await readFile(sessionPath(dataDir), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isSession(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeSession(
  dataDir: string,
  session: Session,
): Promise<void> {
  const path = sessionPath(dataDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(session, null, 2), { mode: 0o600 });
}

export async function clearSession(dataDir: string): Promise<void> {
  await rm(sessionPath(dataDir), { force: true });
}

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.target === "string" &&
    typeof v.workspace === "string" &&
    typeof v.token === "string" &&
    typeof v.createdAt === "string" &&
    typeof v.user === "object" &&
    v.user !== null &&
    typeof (v.user as Record<string, unknown>).id === "string" &&
    typeof (v.user as Record<string, unknown>).email === "string"
  );
}
