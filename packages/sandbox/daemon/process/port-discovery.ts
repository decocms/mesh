import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, readlinkSync } from "node:fs";

/**
 * Discover TCP ports the descendants of a given pid are listening on.
 *
 * The daemon launches `bun run dev` (etc.) with `PORT=$DEV_PORT` as a hint,
 * but most modern dev servers (Vite v7, Next, Astro …) ignore that env and
 * pick their own port (often hardcoded via `--port 3000` in the script).
 * Following the actual bound port keeps the proxy honest.
 *
 * Linux: walks /proc/<pid>/{stat,fd,comm} + /proc/net/tcp{,6}. Cheap,
 * no fork.
 * macOS: shells out to `ps` (parent map) and `lsof` (listening sockets).
 * Roughly 30–80 ms per call — tolerable given the probe's ~500 ms tick.
 */

const SOCKET_INODE_RE = /^socket:\[(\d+)\]$/;

/**
 * Sidecar runtimes spawned by dev servers that listen on TCP but are NOT
 * the user-facing preview surface. Probing them with HEAD requests can
 * crash their handlers (workerd throws on any request whose worker code
 * does relative `fetch()`; node --inspect treats it as a debugger probe)
 * and pollutes the dev process's own logs. Filtered out of port
 * discovery by checking /proc/<pid>/comm.
 */
const SIDECAR_COMMS = new Set<string>([
  "workerd",
  "esbuild",
  "wrangler",
  "tsserver",
]);

/** Reads `/proc/<pid>/comm` (truncated process name); empty string on error. */
function getProcessComm(pid: number): string {
  try {
    return readFileSync(`/proc/${pid}/comm`, "utf8").trim();
  } catch {
    return "";
  }
}

/** Walks /proc/*\/stat to compute the transitive children of `rootPid`. */
function getDescendantPids(rootPid: number): number[] {
  let entries: string[];
  try {
    entries = readdirSync("/proc");
  } catch {
    return [];
  }
  const ppids = new Map<number, number>();
  for (const e of entries) {
    const pid = Number(e);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      // Format: pid (comm) state ppid …  comm is parenthesised and may
      // contain spaces or unbalanced inner parens — split off everything
      // up to the LAST `)` to skip it safely.
      const close = stat.lastIndexOf(")");
      if (close === -1) continue;
      const tail = stat.slice(close + 2).split(" ");
      const ppid = Number(tail[1]);
      if (Number.isInteger(ppid)) ppids.set(pid, ppid);
    } catch {
      // pid exited between readdir and read — skip
    }
  }
  const out = new Set<number>([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, ppid] of ppids) {
      if (out.has(ppid) && !out.has(pid)) {
        out.add(pid);
        changed = true;
      }
    }
  }
  out.delete(rootPid);
  return Array.from(out);
}

/** Resolves the socket inodes a pid currently has open via /proc/<pid>/fd. */
function getProcessSocketInodes(pid: number): Set<number> {
  const inodes = new Set<number>();
  let fds: string[];
  try {
    fds = readdirSync(`/proc/${pid}/fd`);
  } catch {
    return inodes;
  }
  for (const fd of fds) {
    try {
      const link = readlinkSync(`/proc/${pid}/fd/${fd}`);
      const m = SOCKET_INODE_RE.exec(link);
      if (m) inodes.add(Number(m[1]));
    } catch {
      // fd may have closed mid-scan — skip
    }
  }
  return inodes;
}

interface ListeningRow {
  port: number;
  inode: number;
}

export interface DiscoveredPort {
  port: number;
  /** The pid in `opts.rootPids` whose subtree owns the listening socket. */
  rootPid: number;
}

/** Parses the LISTEN rows (state 0A) from /proc/net/tcp + tcp6. */
function readListeningTcp(): ListeningRow[] {
  const out: ListeningRow[] = [];
  for (const path of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    const lines = raw.split("\n");
    // Columns: sl  local  rem  state  tx_queue  rx_queue  tr  tm->when
    //          retrnsmt  uid  timeout  inode  …
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.split(/\s+/);
      if (cols.length < 10) continue;
      if (cols[3] !== "0A") continue;
      const local = cols[1];
      const portHex = local.split(":")[1];
      if (!portHex) continue;
      const port = parseInt(portHex, 16);
      if (!Number.isInteger(port) || port <= 0) continue;
      const inode = Number(cols[9]);
      if (!Number.isInteger(inode)) continue;
      out.push({ port, inode });
    }
  }
  return out;
}

export interface DiscoverPortsOpts {
  rootPids: readonly number[];
  excludePorts?: ReadonlySet<number>;
}

/**
 * Returns the listening TCP ports owned by any descendant of `rootPids`,
 * minus `excludePorts`. Each entry carries the originating root pid so
 * callers can attribute ports to the named process that started them
 * (`processManager.run(name, ...)` keeps the pid → name mapping).
 * Empty array on unsupported platforms or any error.
 */
export function discoverDescendantListeningPorts(
  opts: DiscoverPortsOpts,
): DiscoveredPort[] {
  if (opts.rootPids.length === 0) return [];
  if (process.platform === "darwin") return discoverMacOS(opts);
  return discoverLinux(opts);
}

function discoverLinux({
  rootPids,
  excludePorts,
}: DiscoverPortsOpts): DiscoveredPort[] {
  // First write wins on inode collisions (same socket, multiple holders post-
  // fork). Use Map so we keep root attribution alongside the inode set.
  const inodeToRoot = new Map<number, number>();
  for (const root of rootPids) {
    for (const pid of [root, ...getDescendantPids(root)]) {
      // Skip sidecars (workerd / esbuild / etc.) — their listening sockets
      // are runtime internals, not preview surfaces, and probing them can
      // wedge the dev server.
      if (SIDECAR_COMMS.has(getProcessComm(pid))) continue;
      for (const inode of getProcessSocketInodes(pid)) {
        if (!inodeToRoot.has(inode)) inodeToRoot.set(inode, root);
      }
    }
  }
  if (inodeToRoot.size === 0) return [];
  const seen = new Set<number>();
  const out: DiscoveredPort[] = [];
  for (const row of readListeningTcp()) {
    const root = inodeToRoot.get(row.inode);
    if (root === undefined) continue;
    if (excludePorts?.has(row.port)) continue;
    if (seen.has(row.port)) continue;
    seen.add(row.port);
    out.push({ port: row.port, rootPid: root });
  }
  return out;
}

// ── macOS implementation ─────────────────────────────────────────────────────

function runCmd(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    // Non-zero exit (e.g. lsof when no listeners match) is normal — return ""
    // and let the caller treat it as "nothing discovered."
    return "";
  }
}

interface MacProc {
  pid: number;
  ppid: number;
  comm: string;
}

function listMacProcesses(): MacProc[] {
  // -A: all processes; -o pid=,ppid=,comm= produces "<pid> <ppid> <comm>" rows
  // with no header. `comm` on macOS is the executable's basename (no path,
  // no args), matching SIDECAR_COMMS' shape.
  const out = runCmd("ps", ["-A", "-o", "pid=,ppid=,comm="]);
  if (!out) return [];
  const procs: MacProc[] = [];
  for (const line of out.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const pid = Number(m[1]);
    const ppid = Number(m[2]);
    if (!Number.isInteger(pid) || !Number.isInteger(ppid)) continue;
    // ps may print the full path on some systems — keep just the basename
    // so SIDECAR_COMMS comparisons work uniformly.
    const commPath = m[3];
    const slash = commPath.lastIndexOf("/");
    const comm = slash >= 0 ? commPath.slice(slash + 1) : commPath;
    procs.push({ pid, ppid, comm });
  }
  return procs;
}

function getDescendantSet(rootPid: number, procs: MacProc[]): Set<number> {
  const childrenOf = new Map<number, number[]>();
  for (const p of procs) {
    const list = childrenOf.get(p.ppid);
    if (list) list.push(p.pid);
    else childrenOf.set(p.ppid, [p.pid]);
  }
  const out = new Set<number>([rootPid]);
  const stack: number[] = [rootPid];
  while (stack.length > 0) {
    const next = stack.pop() as number;
    for (const child of childrenOf.get(next) ?? []) {
      if (!out.has(child)) {
        out.add(child);
        stack.push(child);
      }
    }
  }
  return out;
}

interface MacPortRow {
  pid: number;
  port: number;
}

function listMacListeningPortsForPids(pids: readonly number[]): MacPortRow[] {
  if (pids.length === 0) return [];
  // -F pn: machine-parseable output, one field per line, prefixed:
  //   p<pid>   start of a process record
  //   n<addr>:<port>   socket name (one per matching fd)
  // -nP: skip DNS / port→service lookup; -a AND-combines -iTCP and -p.
  const out = runCmd("lsof", [
    "-nP",
    "-iTCP",
    "-sTCP:LISTEN",
    "-a",
    "-p",
    pids.join(","),
    "-F",
    "pn",
  ]);
  if (!out) return [];
  const rows: MacPortRow[] = [];
  let currentPid: number | null = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("p")) {
      const pid = Number(line.slice(1));
      currentPid = Number.isInteger(pid) ? pid : null;
    } else if (line.startsWith("n") && currentPid !== null) {
      // Last colon handles "[::]:3000" / "*:3000" / "127.0.0.1:3000" alike.
      const addr = line.slice(1);
      const colon = addr.lastIndexOf(":");
      if (colon < 0) continue;
      const port = Number(addr.slice(colon + 1));
      if (Number.isInteger(port) && port > 0) {
        rows.push({ pid: currentPid, port });
      }
    }
  }
  return rows;
}

function discoverMacOS({
  rootPids,
  excludePorts,
}: DiscoverPortsOpts): DiscoveredPort[] {
  const procs = listMacProcesses();
  if (procs.length === 0) return [];
  const procByPid = new Map<number, MacProc>();
  for (const p of procs) procByPid.set(p.pid, p);

  // pid → root pid (the rootPids entry whose subtree contains pid).
  const pidToRoot = new Map<number, number>();
  for (const root of rootPids) {
    for (const pid of getDescendantSet(root, procs)) {
      if (pid === root) continue;
      const proc = procByPid.get(pid);
      if (proc && SIDECAR_COMMS.has(proc.comm)) continue;
      if (!pidToRoot.has(pid)) pidToRoot.set(pid, root);
    }
  }
  if (pidToRoot.size === 0) return [];

  const seen = new Set<number>();
  const out: DiscoveredPort[] = [];
  for (const row of listMacListeningPortsForPids(
    Array.from(pidToRoot.keys()),
  )) {
    if (excludePorts?.has(row.port)) continue;
    if (seen.has(row.port)) continue;
    const root = pidToRoot.get(row.pid);
    if (root === undefined) continue;
    seen.add(row.port);
    out.push({ port: row.port, rootPid: root });
  }
  return out;
}
