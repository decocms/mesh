#!/usr/bin/env bun
/**
 * Crash-test the sandbox to observe what mesh does when a sandbox container
 * dies mid-run. Specifically targets the question:
 *   "If Claude Code is streaming and we kill its sandbox container, does
 *    mesh surface a clean error and force-fail the thread, or does the
 *    thread sit stuck?"
 *
 * Usage (from anywhere — uses Bun's built-in SQL, no node_modules dep):
 *
 *   bun packages/mesh-plugin-user-sandbox/scripts/crash-test-sandbox.ts
 *     [--thread <threadId>]
 *     [--signal KILL|TERM]   (default KILL — simulates OOM/crash)
 *     [--wait-before-kill 5] (seconds to wait after a target is found)
 *     [--observe 90]         (seconds to poll the thread after killing)
 *
 * Run-time prerequisites:
 *   - `bun run dev` is running (mesh + embedded postgres on a dynamic port)
 *   - You have an in-flight Claude Code (or remote-LLM) run in some thread.
 *     Start one in the UI, then run this script.
 *
 * Notes:
 *   - The script never reads or writes mesh's process state directly. It
 *     only kills a docker container (which user code in mesh reacts to)
 *     and observes the threads / sandbox_runner_state tables.
 *   - DB connection is auto-discovered from the embedded postgres process
 *     so you don't have to chase the dynamic port. Override with
 *     DATABASE_URL=postgresql://... env var.
 */

import { SQL } from "bun";
import { execFileSync, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

// ───────────────────────────────────────────────────────────────────────────
// Args
// ───────────────────────────────────────────────────────────────────────────

interface Args {
  threadId?: string;
  signal: "KILL" | "TERM";
  waitBeforeKillSec: number;
  observeSec: number;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    signal: "KILL",
    waitBeforeKillSec: 5,
    observeSec: 90,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--thread") out.threadId = argv[++i];
    else if (a === "--signal") {
      const v = argv[++i];
      if (v !== "KILL" && v !== "TERM") {
        throw new Error(`bad --signal: ${v} (use KILL or TERM)`);
      }
      out.signal = v;
    } else if (a === "--wait-before-kill") {
      out.waitBeforeKillSec = Number(argv[++i]);
    } else if (a === "--observe") {
      out.observeSec = Number(argv[++i]);
    } else if (a === "--help" || a === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`unknown arg: ${a} (try --help)`);
    }
  }
  return out;
}

function printUsage(): void {
  console.log(
    `crash-test-sandbox.ts — kill a live sandbox container and observe what mesh does

  --thread <id>           target a specific thread (default: most recent in_progress with sandbox_ref)
  --signal KILL|TERM      signal to send (default KILL — simulates crash)
  --wait-before-kill N    seconds to wait after target is found (default 5)
  --observe N             seconds to poll the thread after killing (default 90)
  -h, --help              show this help`,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Embedded postgres port discovery
// ───────────────────────────────────────────────────────────────────────────

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const ps = spawnSync("ps", ["aux"], { encoding: "utf8" });
  if (ps.status !== 0) {
    throw new Error(`ps failed: ${ps.stderr || ps.stdout}`);
  }
  const lines = ps.stdout
    .split("\n")
    .filter((l) => l.includes("postgres -D") && !l.includes("grep "));
  if (lines.length === 0) {
    throw new Error(
      "no embedded postgres found. Either start `bun run dev`, or set DATABASE_URL.",
    );
  }
  for (const line of lines) {
    const m = line.match(/-p\s+(\d{3,5})\b/);
    if (m) return `postgresql://postgres:postgres@localhost:${m[1]}/postgres`;
  }
  throw new Error(
    `found postgres process but no -p <PORT> arg:\n${lines.join("\n")}`,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Domain queries
// ───────────────────────────────────────────────────────────────────────────

interface ThreadRow {
  id: string;
  organization_id: string;
  status: string;
  run_owner_pod: string | null;
  run_config: unknown | null;
  run_started_at: Date | null;
  sandbox_ref: string | null;
  virtual_mcp_id: string | null;
  trigger_id: string | null;
  updated_at: Date;
}

interface RunnerStateRow {
  user_id: string;
  project_ref: string;
  runner_kind: string;
  handle: string;
  state: { token?: string; hostPort?: number; [k: string]: unknown };
  updated_at: Date;
}

async function findCandidateThread(
  sql: SQL,
  hint: string | undefined,
): Promise<ThreadRow> {
  if (hint) {
    const rows = await sql<ThreadRow[]>`
      SELECT id, organization_id, status, run_owner_pod, run_config,
             run_started_at, sandbox_ref, virtual_mcp_id, trigger_id, updated_at
      FROM threads WHERE id = ${hint}
    `;
    if (rows.length === 0) throw new Error(`no thread with id ${hint}`);
    return rows[0];
  }
  const rows = await sql<ThreadRow[]>`
    SELECT id, organization_id, status, run_owner_pod, run_config,
           run_started_at, sandbox_ref, virtual_mcp_id, trigger_id, updated_at
    FROM threads
    WHERE status = 'in_progress' AND sandbox_ref IS NOT NULL
    ORDER BY run_started_at DESC NULLS LAST, updated_at DESC
    LIMIT 5
  `;
  if (rows.length === 0) {
    throw new Error(
      "no in_progress thread with a sandbox_ref. Start a run first.",
    );
  }
  if (rows.length > 1) {
    console.warn(
      `[crash-test] multiple in_progress threads found:\n${rows
        .map((r) => `  ${r.id}  sandbox_ref=${r.sandbox_ref}`)
        .join(
          "\n",
        )}\nPicking the most recent. Pass --thread <id> to be specific.`,
    );
  }
  return rows[0];
}

async function findRunnerStateForThread(
  sql: SQL,
  thread: ThreadRow,
): Promise<RunnerStateRow | null> {
  if (!thread.sandbox_ref) return null;
  const rows = await sql<RunnerStateRow[]>`
    SELECT user_id, project_ref, runner_kind, handle, state, updated_at
    FROM sandbox_runner_state
    WHERE project_ref = ${thread.sandbox_ref}
    ORDER BY updated_at DESC LIMIT 5
  `;
  return rows[0] ?? null;
}

// ───────────────────────────────────────────────────────────────────────────
// Docker
// ───────────────────────────────────────────────────────────────────────────

interface DockerInspect {
  id: string;
  state: string;
  exitCode: number | null;
  finishedAt: string | null;
  oomKilled: boolean | null;
  image: string;
}

function dockerInspect(idOrHandle: string): DockerInspect | null {
  // The runner's "handle" is set as --label mesh-sandbox.id, not the docker
  // container ID. So filter by label first; if that fails, try as a literal
  // container ID/name.
  const byLabel = spawnSync(
    "docker",
    ["ps", "-aq", "--filter", `label=mesh-sandbox.id=${idOrHandle}`],
    { encoding: "utf8" },
  );
  let containerId = "";
  if (byLabel.status === 0) {
    containerId = byLabel.stdout.trim().split("\n")[0] ?? "";
  }
  if (!containerId) containerId = idOrHandle;

  const inspect = spawnSync(
    "docker",
    [
      "inspect",
      "--format",
      "{{.Id}}|{{.State.Status}}|{{.State.ExitCode}}|{{.State.FinishedAt}}|{{.State.OOMKilled}}|{{.Config.Image}}",
      containerId,
    ],
    { encoding: "utf8" },
  );
  if (inspect.status !== 0) return null;
  const [id, state, exit, finished, oom, image] = inspect.stdout
    .trim()
    .split("|");
  return {
    id,
    state,
    exitCode: exit === "0" ? 0 : exit ? Number(exit) : null,
    finishedAt:
      finished && finished !== "0001-01-01T00:00:00Z" ? finished : null,
    oomKilled: oom === "true" ? true : oom === "false" ? false : null,
    image,
  };
}

function dockerKill(containerId: string, signal: "KILL" | "TERM"): void {
  console.log(`[crash-test] docker kill -s ${signal} ${containerId}`);
  execFileSync("docker", ["kill", "-s", signal, containerId], {
    stdio: "inherit",
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Snapshots
// ───────────────────────────────────────────────────────────────────────────

interface Snapshot {
  t: number; // ms since kill
  status: string;
  run_owner_pod: string | null;
  has_run_config: boolean;
  updated_at: string;
  runner_state_present: boolean;
  container_state: string | null;
  container_exit_code: number | null;
  container_oom: boolean | null;
}

function fmtSnapshot(s: Snapshot): string {
  const parts = [
    `t=+${(s.t / 1000).toFixed(1)}s`,
    `thread.status=${s.status}`,
    `run_owner_pod=${s.run_owner_pod ?? "NULL"}`,
    `run_config=${s.has_run_config ? "present" : "NULL"}`,
    `runner_state=${s.runner_state_present ? "present" : "ABSENT"}`,
    `container=${s.container_state ?? "gone"}`,
  ];
  if (s.container_exit_code !== null)
    parts.push(`exit=${s.container_exit_code}`);
  if (s.container_oom) parts.push("OOM");
  return parts.join("  ");
}

function diffSnapshots(prev: Snapshot | null, cur: Snapshot): string[] {
  if (!prev) return ["initial state"];
  const changes: string[] = [];
  if (prev.status !== cur.status) {
    changes.push(`status: ${prev.status} → ${cur.status}`);
  }
  if (prev.run_owner_pod !== cur.run_owner_pod) {
    changes.push(`run_owner_pod: ${prev.run_owner_pod} → ${cur.run_owner_pod}`);
  }
  if (prev.has_run_config !== cur.has_run_config) {
    changes.push(
      `run_config: ${prev.has_run_config ? "present" : "NULL"} → ${
        cur.has_run_config ? "present" : "NULL"
      }`,
    );
  }
  if (prev.runner_state_present !== cur.runner_state_present) {
    changes.push(
      `runner_state row: ${prev.runner_state_present ? "present" : "ABSENT"} → ${
        cur.runner_state_present ? "present" : "ABSENT"
      }`,
    );
  }
  if (prev.container_state !== cur.container_state) {
    changes.push(
      `container: ${prev.container_state ?? "gone"} → ${cur.container_state ?? "gone"}`,
    );
  }
  return changes;
}

async function takeSnapshot(
  sql: SQL,
  threadId: string,
  sandboxRef: string,
  containerId: string | null,
  killT0: number,
): Promise<Snapshot> {
  const rows = await sql<
    Array<{
      status: string;
      run_owner_pod: string | null;
      run_config: unknown | null;
      updated_at: Date;
    }>
  >`SELECT status, run_owner_pod, run_config, updated_at
    FROM threads WHERE id = ${threadId}`;
  const t = rows[0];

  const runner = await sql<Array<{ handle: string }>>`
    SELECT handle FROM sandbox_runner_state WHERE project_ref = ${sandboxRef}
  `;

  const ci = containerId ? dockerInspect(containerId) : null;

  return {
    t: Date.now() - killT0,
    status: t?.status ?? "(thread row missing)",
    run_owner_pod: t?.run_owner_pod ?? null,
    has_run_config: t?.run_config != null,
    updated_at: t?.updated_at?.toISOString?.() ?? "",
    runner_state_present: runner.length > 0,
    container_state: ci?.state ?? null,
    container_exit_code: ci?.exitCode ?? null,
    container_oom: ci?.oomKilled ?? null,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const databaseUrl = resolveDatabaseUrl();
  console.log(`[crash-test] db: ${databaseUrl.replace(/:[^:@]+@/, ":***@")}`);

  const sql = new SQL(databaseUrl);

  try {
    const thread = await findCandidateThread(sql, args.threadId);
    console.log(
      `[crash-test] target thread: ${thread.id}\n` +
        `              org=${thread.organization_id}\n` +
        `              status=${thread.status}\n` +
        `              sandbox_ref=${thread.sandbox_ref}\n` +
        `              virtual_mcp_id=${thread.virtual_mcp_id}\n` +
        `              trigger_id=${thread.trigger_id}\n` +
        `              run_owner_pod=${thread.run_owner_pod ?? "NULL"}\n` +
        `              run_config=${thread.run_config ? "present" : "NULL"}`,
    );

    const runner = await findRunnerStateForThread(sql, thread);
    if (!runner) {
      throw new Error(
        `no sandbox_runner_state row for sandbox_ref=${thread.sandbox_ref} — ` +
          `sandbox may not have been provisioned yet. Wait for the first ` +
          `bash tool call to finish, then re-run.`,
      );
    }
    console.log(
      `[crash-test] runner state: kind=${runner.runner_kind} handle=${runner.handle}`,
    );
    if (runner.runner_kind !== "docker") {
      console.warn(
        `[crash-test] WARNING: runner kind is "${runner.runner_kind}", not docker. ` +
          `This script only knows how to crash docker containers.`,
      );
    }

    const ci = dockerInspect(runner.handle);
    if (!ci) {
      throw new Error(
        `no docker container found for handle ${runner.handle}. The ` +
          `sandbox may already be gone — check if the run completed already.`,
      );
    }
    if (ci.state !== "running") {
      throw new Error(
        `container ${ci.id} is in state "${ci.state}", not running. Aborting.`,
      );
    }
    console.log(
      `[crash-test] container: ${ci.id.slice(0, 12)} image=${ci.image} state=${ci.state}`,
    );

    console.log(
      `\n[crash-test] Will send SIG${args.signal} to the container in ${args.waitBeforeKillSec}s.\n` +
        `             Make sure the LLM is mid-stream NOW (e.g. it just started a long bash).\n` +
        `             Press Ctrl-C to abort.\n`,
    );
    await sleep(args.waitBeforeKillSec * 1000);

    const t0 = Date.now();
    let prev: Snapshot | null = null;
    const pre = await takeSnapshot(
      sql,
      thread.id,
      thread.sandbox_ref!,
      ci.id,
      t0,
    );
    console.log(`[crash-test] PRE-KILL: ${fmtSnapshot({ ...pre, t: 0 })}`);

    dockerKill(ci.id, args.signal);
    const killT = Date.now();
    console.log(`[crash-test] killed at ${new Date(killT).toISOString()}\n`);
    prev = pre;

    const deadline = killT + args.observeSec * 1000;
    let lastPrintAt = Date.now();
    while (Date.now() < deadline) {
      const cur = await takeSnapshot(
        sql,
        thread.id,
        thread.sandbox_ref!,
        ci.id,
        killT,
      );
      const changes = diffSnapshots(prev, cur);
      if (changes.length > 0) {
        console.log(`[t=+${(cur.t / 1000).toFixed(1)}s] ${changes.join("; ")}`);
        console.log(`           ${fmtSnapshot(cur)}\n`);
        prev = cur;
        lastPrintAt = Date.now();
      } else if (Date.now() - lastPrintAt > 15_000) {
        console.log(`[t=+${(cur.t / 1000).toFixed(1)}s] (no change)`);
        lastPrintAt = Date.now();
      }
      if (
        cur.status === "completed" ||
        cur.status === "failed" ||
        cur.status === "cancelled"
      ) {
        console.log(
          `[crash-test] thread reached terminal state: ${cur.status}`,
        );
        break;
      }
      await sleep(1000);
    }

    const final = await takeSnapshot(
      sql,
      thread.id,
      thread.sandbox_ref!,
      ci.id,
      killT,
    );
    console.log("\n[crash-test] ─── FINAL STATE ───");
    console.log(`             ${fmtSnapshot(final)}`);

    const verdict =
      final.status === "in_progress" && final.run_owner_pod !== null
        ? "STUCK: thread still in_progress and still owned by a (now-dead) sandbox. " +
          "No automatic recovery within the observation window. Either the ghost reaper " +
          "runs on a longer interval, or there's a real bug to fix."
        : final.status === "in_progress" && final.run_owner_pod === null
          ? "ORPHANED: thread is in_progress with no owner. Will be picked up by " +
            "RunRegistry orphan recovery on next mesh-pod startup or pod-death notification."
          : final.status === "failed" || final.status === "cancelled"
            ? `CLEAN-FAIL: thread terminated as ${final.status}. mesh detected the ` +
              `sandbox death and force-failed the run.`
            : final.status === "completed"
              ? "COMPLETED: the run actually finished — kill came too late or container was idle."
              : `UNEXPECTED: thread.status=${final.status}`;
    console.log(`             VERDICT: ${verdict}\n`);
  } finally {
    await sql.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
