import { readdirSync, readFileSync, readlinkSync } from "node:fs";

/**
 * Discover TCP ports the descendants of a given pid are listening on.
 *
 * The daemon launches `bun run dev` (etc.) with `PORT=$DEV_PORT` as a hint,
 * but most modern dev servers (Vite v7, Next, Astro …) ignore that env and
 * pick their own port. Reading /proc lets the proxy follow whatever the
 * dev process actually bound to.
 *
 * Linux-only; on macOS/test hosts the readSync calls throw and we fall back
 * to an empty result. Callers should treat "no discovery" as "use the env
 * hint" — see entry.ts for the candidate-list composition.
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
 * minus `excludePorts`. Empty array on non-Linux or any read failure.
 */
export function discoverDescendantListeningPorts({
  rootPids,
  excludePorts,
}: DiscoverPortsOpts): number[] {
  if (rootPids.length === 0) return [];
  const owned = new Set<number>();
  for (const root of rootPids) {
    for (const pid of [root, ...getDescendantPids(root)]) {
      // Skip sidecars (workerd / esbuild / etc.) — their listening sockets
      // are runtime internals, not preview surfaces, and probing them can
      // wedge the dev server.
      if (SIDECAR_COMMS.has(getProcessComm(pid))) continue;
      for (const inode of getProcessSocketInodes(pid)) owned.add(inode);
    }
  }
  if (owned.size === 0) return [];
  const ports = new Set<number>();
  for (const row of readListeningTcp()) {
    if (!owned.has(row.inode)) continue;
    if (excludePorts?.has(row.port)) continue;
    ports.add(row.port);
  }
  return Array.from(ports);
}
