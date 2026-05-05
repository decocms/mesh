import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { startOAuthCallbackServer } from "../../lib/oauth-callback";
import { writeSession, type Session } from "../../lib/session";

export interface LoginOptions {
  dataDir: string;
  target?: string;
  /** Injectable for tests. Defaults to opening the user's default browser. */
  openBrowser?: (url: string) => Promise<void>;
  /** Injectable for tests. */
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
}

export const DEFAULT_TARGET = "https://studio.decocms.com";

export async function loginCommand(options: LoginOptions): Promise<number> {
  const target = (options.target ?? DEFAULT_TARGET).replace(/\/$/, "");
  const fetchImpl = options.fetch ?? fetch;
  const openImpl = options.openBrowser ?? defaultOpenBrowser;

  const state = randomUUID();
  const server = await startOAuthCallbackServer({ expectedState: state });
  try {
    const callback = encodeURIComponent(server.url);
    const url = `${target}/auth/cli?callback=${callback}&state=${state}`;
    console.log(`Opening ${url} in your browser...`);
    await openImpl(url);

    const { code } = await server.waitForCallback();

    const exchangeRes = await fetchImpl(`${target}/api/auth/cli/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!exchangeRes.ok) {
      console.error(
        `Token exchange failed: HTTP ${exchangeRes.status} ${await exchangeRes.text().catch(() => "")}`,
      );
      return 1;
    }
    const data = (await exchangeRes.json()) as {
      token: string;
      workspace: string;
      user: { id: string; email: string };
    };

    if (
      typeof data?.token !== "string" ||
      typeof data?.workspace !== "string" ||
      typeof data?.user?.id !== "string" ||
      typeof data?.user?.email !== "string"
    ) {
      console.error(
        "Token exchange failed: server returned incomplete response",
      );
      return 1;
    }

    const session: Session = {
      target,
      workspace: data.workspace,
      user: data.user,
      token: data.token,
      createdAt: new Date().toISOString(),
    };
    await writeSession(options.dataDir, session);

    console.log(`Logged in as ${data.user.email} (${data.workspace}).`);
    return 0;
  } catch (err) {
    console.error(
      `Login failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  } finally {
    server.close();
  }
}

async function defaultOpenBrowser(url: string): Promise<void> {
  let command: string;
  let args: string[];
  switch (process.platform) {
    case "darwin":
      command = "open";
      args = [url];
      break;
    case "win32":
      command = "cmd";
      args = ["/c", "start", "", url];
      break;
    default:
      command = "xdg-open";
      args = [url];
      break;
  }
  await new Promise<void>((resolve) => {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => {
      console.log(
        `Could not open browser automatically. Please open this URL manually:\n  ${url}`,
      );
      resolve();
    });
    child.on("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
