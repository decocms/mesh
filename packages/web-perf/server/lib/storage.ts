import { join } from "node:path";
import { homedir } from "node:os";
import type { TrackedSite, SiteSummary } from "./types.ts";

const SITES_DIR = join(homedir(), ".deco", "web-perf", "sites");

async function ensureDir(dir: string): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dir, { recursive: true });
}

function sitePath(id: string): string {
  return join(SITES_DIR, `${id}.json`);
}

export async function saveSite(site: TrackedSite): Promise<void> {
  await ensureDir(SITES_DIR);
  await Bun.write(sitePath(site.id), JSON.stringify(site, null, 2));
}

export async function loadSite(id: string): Promise<TrackedSite | null> {
  const file = Bun.file(sitePath(id));
  if (!(await file.exists())) return null;
  return file.json() as Promise<TrackedSite>;
}

export async function listSites(): Promise<TrackedSite[]> {
  await ensureDir(SITES_DIR);
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(SITES_DIR);
  const sites: TrackedSite[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const site = (await Bun.file(join(SITES_DIR, file)).json()) as TrackedSite;
    sites.push(site);
  }

  return sites.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export async function listSiteSummaries(): Promise<SiteSummary[]> {
  const sites = await listSites();
  return sites.map((site) => {
    const latest = site.snapshots[0];
    const crux = latest?.crux?.phone ?? latest?.crux?.all;
    return {
      id: site.id,
      name: site.name,
      origin: site.origin,
      snapshotCount: site.snapshots.length,
      latestSnapshot: latest
        ? {
            timestamp: latest.timestamp,
            performanceScore: latest.pagespeed?.performanceScore,
            lcp: crux?.lcp?.percentiles.p75,
            inp: crux?.inp?.percentiles.p75,
            cls: crux?.cls?.percentiles.p75,
            fcp: crux?.fcp?.percentiles.p75,
            ttfb: crux?.ttfb?.percentiles.p75,
          }
        : undefined,
    };
  });
}

export async function deleteSite(id: string): Promise<boolean> {
  const { unlink } = await import("node:fs/promises");
  try {
    await unlink(sitePath(id));
    return true;
  } catch {
    return false;
  }
}
