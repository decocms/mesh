import type { Freestyle } from "freestyle-sandboxes";
import { VmSpec } from "freestyle-sandboxes";
import { VmBun } from "@freestyle-sh/with-bun";
import { VmDeno } from "@freestyle-sh/with-deno";
import type { FreestyleMetadata } from "./types";

const BUN_BIN = "/opt/bun/bin/bun";

export interface RunScriptResult {
  vmId: string;
  domain: string | null;
}

export async function runScript(
  freestyle: Freestyle,
  metadata: FreestyleMetadata,
  script: string,
): Promise<RunScriptResult> {
  if (!metadata.freestyle_repo_id) {
    throw new Error("No Freestyle repo configured. Add a repo first.");
  }

  const validScripts = metadata.scripts ?? {};
  if (!(script in validScripts)) {
    throw new Error(
      `Script "${script}" not found. Available: ${Object.keys(validScripts).join(", ")}`,
    );
  }

  if (metadata.freestyle_vm_id) {
    await freestyle.vms
      .delete({ vmId: metadata.freestyle_vm_id })
      .catch(() => {});
  }

  const runtime = metadata.runtime ?? "bun";
  const targetPort = metadata.preview_port ?? 3000;

  // Create VM with the correct integration per runtime
  const repoId = metadata.freestyle_repo_id;
  const createOpts = {
    idleTimeoutSeconds: 600,
    ports: [{ port: 443, targetPort }],
  };

  let vmId: string;
  let vm: { exec: (cmd: string) => Promise<unknown> };
  let rawDomains: unknown;

  if (runtime === "deno") {
    const spec = new VmSpec()
      .with("deno", new VmDeno())
      .repo(repoId, "/app")
      .workdir("/app");
    const result = await freestyle.vms.create({ spec, ...createOpts });
    vmId = result.vmId;
    vm = result.vm;
    rawDomains = (result as Record<string, unknown>).domains;
  } else {
    const spec = new VmSpec()
      .with("js", new VmBun())
      .repo(repoId, "/app")
      .workdir("/app");
    const result = await freestyle.vms.create({ spec, ...createOpts });
    vmId = result.vmId;
    vm = result.vm;
    rawDomains = (result as Record<string, unknown>).domains;
  }

  console.log("[runtime] VM created:", { vmId, domains: rawDomains });

  // Install deps
  // biome-ignore lint: dynamic access based on runtime
  const vmAny: any = vm;
  if (runtime === "deno") {
    await vmAny.deno.install({ directory: "/app" });
  } else {
    await vmAny.js.install({ directory: "/app" });
  }

  // Start the script — use deno task or bun run
  const runCmd =
    runtime === "deno" ? `deno task ${script}` : `${BUN_BIN} run ${script}`;

  await vm.exec(
    `cd /app && HOST=0.0.0.0 PORT=${targetPort} nohup ${runCmd} > /tmp/app.log 2>&1 &`,
  );

  // Wait for server to start, then diagnose
  await new Promise((resolve) => setTimeout(resolve, 3000));
  try {
    const logResult = await vm.exec(
      "tail -20 /tmp/app.log 2>/dev/null || echo 'no log'",
    );
    console.log("[runtime] App log:", logResult);
    const whichDeno = await vm.exec(
      "which deno 2>/dev/null || echo 'deno not found'",
    );
    console.log("[runtime] deno location:", whichDeno);
  } catch (e) {
    console.error("[runtime] Diagnostics failed:", e);
  }

  // Get domain
  let domain: string | null = null;
  if (Array.isArray(rawDomains) && rawDomains.length > 0) {
    domain = rawDomains[0];
  }

  // Fallback: construct from vmId
  if (!domain) {
    domain = `${vmId}.freestyle.sh`;
    console.log("[runtime] Constructed domain from vmId:", domain);
  }

  console.log("[runtime] Final domain:", domain);

  return {
    vmId,
    domain,
  };
}

export async function stopScript(
  freestyle: Freestyle,
  metadata: FreestyleMetadata,
): Promise<void> {
  if (metadata.freestyle_vm_id) {
    await freestyle.vms
      .delete({ vmId: metadata.freestyle_vm_id })
      .catch(() => {});
  }
}
