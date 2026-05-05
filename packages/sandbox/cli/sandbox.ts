/**
 * deco — sandbox control CLI.
 *
 * Talks to the local daemon over HTTP. Token and port come from env vars
 * that are always present inside sandbox containers.
 *
 * Usage:
 *   deco app start
 *   deco app stop
 *   deco app status
 *   deco config show
 *   deco config update [--pm npm|pnpm|yarn|bun|deno] [--runtime node|bun|deno]
 *                      [--path <dir>] [--port <number>] [--intent running|paused]
 */

const PORT = process.env.DAEMON_PORT ?? "9000";
const TOKEN = process.env.DAEMON_TOKEN ?? "";
const CONFIG_URL = `http://localhost:${PORT}/_decopilot_vm/config`;

// Daemon expects base64-encoded JSON bodies (Cloudflare WAF bypass).
function encodeBody(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

async function daemonGet(): Promise<unknown> {
  const res = await fetch(CONFIG_URL, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`daemon ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function daemonPut(patch: object): Promise<{ transition: string }> {
  const res = await fetch(CONFIG_URL, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    body: encodeBody(patch),
  });
  if (!res.ok) {
    throw new Error(`daemon ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<{ transition: string }>;
}

function parseFlags(args: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
      out[arg.slice(2)] = args[++i];
    }
  }
  return out;
}

function pad(label: string): string {
  return label.padEnd(16);
}

function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    if (u.username) u.username = "***";
    return u.toString();
  } catch {
    return url.replace(/:\/\/[^@]*@/, "://***@");
  }
}

// ── app commands ──────────────────────────────────────────────────────────────

async function appStart(): Promise<void> {
  const res = await daemonPut({ application: { intent: "running" } });
  console.log(`${pad("transition:")}${res.transition}`);
}

async function appStop(): Promise<void> {
  const res = await daemonPut({ application: { intent: "paused" } });
  console.log(`${pad("transition:")}${res.transition}`);
}

async function appStatus(): Promise<void> {
  const data = (await daemonGet()) as {
    app?: { status?: string; failureReason?: string };
    config?: {
      application?: {
        intent?: string;
        desiredPort?: number;
        proxy?: { targetPort?: number };
      };
    };
    ready?: boolean;
    orchestrator?: { running?: boolean; pending?: number };
  };

  const rows: [string, string | number | boolean][] = [
    ["status:", data.app?.status ?? "unknown"],
    ["ready:", data.ready ?? false],
    ["intent:", data.config?.application?.intent ?? "unknown"],
  ];
  if (data.app?.failureReason) {
    rows.push(["failure:", data.app.failureReason]);
  }
  if (data.config?.application?.desiredPort) {
    rows.push(["desired-port:", data.config.application.desiredPort]);
  }
  if (data.config?.application?.proxy?.targetPort) {
    rows.push(["active-port:", data.config.application.proxy.targetPort]);
  }
  if (data.orchestrator?.running) {
    rows.push([
      "orchestrator:",
      `running (${data.orchestrator.pending} pending)`,
    ]);
  }
  for (const [k, v] of rows) console.log(`${pad(k)}${v}`);
}

// ── config commands ───────────────────────────────────────────────────────────

async function configShow(): Promise<void> {
  const data = (await daemonGet()) as {
    config?: {
      git?: { repository?: { cloneUrl?: string; branch?: string } };
      application?: {
        packageManager?: { name?: string; path?: string };
        runtime?: string;
        intent?: string;
        desiredPort?: number;
        proxy?: { targetPort?: number };
      };
    };
  };

  if (!data.config) {
    console.log("no config — sandbox has not been initialised yet");
    return;
  }

  const git = data.config.git?.repository;
  const app = data.config.application;
  const pm = app?.packageManager;

  const rows: [string, string | number][] = [];
  if (git?.cloneUrl) rows.push(["repo:", redactUrl(git.cloneUrl)]);
  if (git?.branch) rows.push(["branch:", git.branch]);
  if (pm?.name) {
    rows.push([
      "packageManager:",
      pm.path ? `${pm.name}  (${pm.path})` : pm.name,
    ]);
  }
  if (app?.runtime) rows.push(["runtime:", app.runtime]);
  if (app?.intent) rows.push(["intent:", app.intent]);
  if (app?.desiredPort) rows.push(["desired-port:", app.desiredPort]);
  if (app?.proxy?.targetPort) rows.push(["active-port:", app.proxy.targetPort]);

  if (rows.length === 0) {
    console.log("config present but empty");
    return;
  }
  for (const [k, v] of rows) console.log(`${pad(k)}${v}`);
}

async function configUpdate(args: string[]): Promise<void> {
  const flags = parseFlags(args);

  const application: Record<string, unknown> = {};

  if (flags.pm !== undefined || flags.path !== undefined) {
    const pm: Record<string, unknown> = {};
    if (flags.pm !== undefined) pm.name = flags.pm;
    if (flags.path !== undefined) pm.path = flags.path || null;
    application.packageManager = pm;
  }
  if (flags.runtime !== undefined) application.runtime = flags.runtime;
  if (flags.intent !== undefined) application.intent = flags.intent;
  if (flags.port !== undefined) {
    const n = parseInt(flags.port, 10);
    if (Number.isNaN(n) || n < 1 || n > 65535) {
      console.error(`error: --port must be 1-65535`);
      process.exit(1);
    }
    application.desiredPort = n;
  }

  if (Object.keys(application).length === 0) {
    console.error(
      "error: at least one flag required: --pm, --runtime, --path, --port, --intent",
    );
    process.exit(1);
  }

  const res = await daemonPut({ application });
  console.log(`${pad("transition:")}${res.transition}`);
}

// ── main ──────────────────────────────────────────────────────────────────────

function usage(): void {
  console.log(`Usage:
  deco app start
  deco app stop
  deco app status
  deco config show
  deco config update [--pm npm|pnpm|yarn|bun|deno] [--runtime node|bun|deno]
                     [--path <dir>] [--port <number>] [--intent running|paused]`);
}

const [, , group, cmd, ...rest] = process.argv;

try {
  if (group === "app") {
    if (cmd === "start") await appStart();
    else if (cmd === "stop") await appStop();
    else if (cmd === "status") await appStatus();
    else {
      usage();
      process.exit(1);
    }
  } else if (group === "config") {
    if (cmd === "show") await configShow();
    else if (cmd === "update") await configUpdate(rest);
    else {
      usage();
      process.exit(1);
    }
  } else {
    usage();
    process.exit(group ? 1 : 0);
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
    console.error("error: daemon not reachable (is the sandbox running?)");
  } else {
    console.error(`error: ${msg}`);
  }
  process.exit(1);
}
