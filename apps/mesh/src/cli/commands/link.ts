import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { computeAppDomain } from "../lib/app-domain";
import { copyToClipboard } from "../lib/clipboard";
import { waitForPort } from "../lib/port-wait";
import { readSession, type Session } from "../lib/session";
import { loginCommand } from "./auth/login";

export interface TunnelHandle {
  closed: Promise<void>;
  close: () => void;
  // TODO: surface auth failure separately so the caller can show the
  // "session may be expired" hint described in the spec.
}

export type TunnelOpener = (params: {
  domain: string;
  localAddr: string;
  apiKey: string;
  server: string;
}) => Promise<TunnelHandle>;

/** Minimal spawn signature used by linkCommand — compatible with node:child_process spawn. */
export type SpawnFn = (
  command: string,
  args: string[],
  options: { stdio: "inherit"; shell: boolean; env: NodeJS.ProcessEnv },
) => ChildProcess;

export interface LinkOptions {
  cwd: string;
  dataDir: string;
  port: number;
  env: string;
  runCommand: string[];
  /** Injectable: defaults to defaultTunnelOpener (dynamic import of @deco-cx/warp-node). */
  tunnelOpener?: TunnelOpener;
  /** Injectable: defaults to waitForPort. */
  portWaiter?: (port: number) => Promise<string>;
  /** Injectable: defaults to copyToClipboard. */
  copyClipboard?: (text: string) => Promise<boolean>;
  /** Called when no session is present. Returns the new session or null on failure. */
  ensureSession?: () => Promise<Session | null>;
  /** Injectable: defaults to node:child_process spawn. */
  spawn?: SpawnFn;
  /** Reconnect delay after a tunnel disconnect (default 500ms, matches legacy). */
  reconnectDelayMs?: number;
}

export interface LinkRunResult {
  exit: Promise<number>;
  cancel: () => Promise<void>;
}

export function linkCommand(options: LinkOptions): LinkRunResult {
  let resolveExit!: (n: number) => void;
  const exit = new Promise<number>((r) => {
    resolveExit = r;
  });

  let child: ChildProcess | undefined;
  let tunnel: TunnelHandle | undefined;
  let cancelled = false;

  const cancel = async () => {
    cancelled = true;
    try {
      child?.kill("SIGTERM");
    } catch {}
    try {
      tunnel?.close();
    } catch {}
    resolveExit(0);
  };

  void (async () => {
    try {
      let session = await readSession(options.dataDir);
      if (!session) {
        const ensure =
          options.ensureSession ?? defaultEnsureSession(options.dataDir);
        console.log("No session found — opening login...");
        session = await ensure();
        if (!session) {
          console.error("Login failed; cannot open tunnel.");
          resolveExit(1);
          return;
        }
      }

      const appName = await readPackageName(options.cwd);
      if (!appName) {
        console.error(
          "Could not read `name` from package.json. Run `decocms link` from a project directory.",
        );
        resolveExit(1);
        return;
      }

      const domain = computeAppDomain(session.workspace, appName);
      const publicUrl = `https://${domain}`;

      const spawnImpl: SpawnFn = options.spawn ?? nodeSpawn;
      if (options.runCommand.length > 0) {
        const [cmd, ...args] = options.runCommand;
        if (!cmd) {
          console.error("runCommand must not be empty");
          resolveExit(1);
          return;
        }
        console.log(`Starting: ${cmd} ${args.join(" ")}`);
        const spawned = spawnImpl(cmd, args, {
          stdio: "inherit",
          shell: true,
          env: { ...process.env, [options.env]: publicUrl },
        });
        child = spawned;
        spawned.on("exit", (code) => {
          if (cancelled) return;
          cancelled = true;
          try {
            tunnel?.close();
          } catch {}
          resolveExit(code ?? 0);
        });
      } else {
        console.log(
          `Tunnel will connect to existing service on port ${options.port}.`,
        );
      }

      const wait = options.portWaiter ?? ((p: number) => waitForPort(p));
      const opener = options.tunnelOpener ?? defaultTunnelOpener;
      const copy = options.copyClipboard ?? copyToClipboard;
      const reconnectDelay = options.reconnectDelayMs ?? 500;

      // Loop: open tunnel, wait for it to close, reconnect after a small delay.
      // Matches legacy behavior — exits only when the user cancels.
      let firstOpen = true;
      while (!cancelled) {
        const host = await wait(options.port);
        try {
          tunnel = await opener({
            domain,
            localAddr: `http://${host}:${options.port}`,
            apiKey: session.token,
            server: `wss://${domain}`,
          });
        } catch (err) {
          console.error(
            `Tunnel connect failed, retrying: ${err instanceof Error ? err.message : String(err)}`,
          );
          await sleep(reconnectDelay);
          continue;
        }

        if (firstOpen) {
          console.log(`Tunnel open: ${publicUrl}`);
          if (await copy(publicUrl)) {
            console.log("(URL copied to clipboard)");
          }
          firstOpen = false;
        } else {
          console.log("Tunnel reconnected.");
        }

        await tunnel.closed;
        if (cancelled) break;
        console.log("Tunnel closed, reconnecting...");
        await sleep(reconnectDelay);
      }

      if (!cancelled) resolveExit(0);
    } catch (err) {
      console.error(
        `Link failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      resolveExit(1);
    }
  })();

  return { exit, cancel };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readPackageName(cwd: string): Promise<string | null> {
  try {
    const raw = await readFile(join(cwd, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { name?: unknown };
    return typeof parsed.name === "string" && parsed.name.length > 0
      ? parsed.name
      : null;
  } catch {
    return null;
  }
}

function defaultEnsureSession(dataDir: string): () => Promise<Session | null> {
  return async () => {
    const code = await loginCommand({ dataDir });
    if (code !== 0) return null;
    return readSession(dataDir);
  };
}

const defaultTunnelOpener: TunnelOpener = async (params) => {
  // @ts-expect-error — @deco-cx/warp-node has no types
  const { connect } = await import("@deco-cx/warp-node");
  const tunnel = await connect({
    domain: params.domain,
    localAddr: params.localAddr,
    server: params.server,
    apiKey: params.apiKey,
  });
  await tunnel.registered;
  return {
    closed: tunnel.closed,
    close: () => {
      try {
        tunnel.close?.();
      } catch {}
    },
  };
};
