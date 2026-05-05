import { clearSession, readSession } from "../../lib/session";

export interface LogoutOptions {
  dataDir: string;
  /** Injectable for tests. */
  fetch?: typeof fetch;
}

export async function logoutCommand(options: LogoutOptions): Promise<number> {
  const session = await readSession(options.dataDir);
  if (!session) {
    console.log("Already logged out.");
    return 0;
  }

  const fetchImpl = options.fetch ?? fetch;
  try {
    await fetchImpl(`${session.target}/api/auth/cli/revoke`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.token}` },
    });
  } catch {
    // Best-effort revoke; we still clear the local session.
  }

  await clearSession(options.dataDir);
  console.log("Logged out.");
  return 0;
}
