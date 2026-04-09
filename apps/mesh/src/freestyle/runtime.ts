import type { Freestyle } from "freestyle-sandboxes";
import { VmSpec } from "freestyle-sandboxes";
import { VmBun } from "@freestyle-sh/with-bun";
import { VmDeno } from "@freestyle-sh/with-deno";
import type { FreestyleMetadata } from "./types";

const BUN_BIN = "/opt/bun/bin/bun";
const DENO_BIN = "/root/.deno/bin/deno";

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

  // Use VmSpec for repo + runtime (handles Freestyle repo IDs),
  // then pass ports as top-level options for domain assignment
  const spec = new VmSpec()
    .with("js", runtime === "deno" ? new VmDeno() : new VmBun())
    .repo(metadata.freestyle_repo_id, "/app")
    .workdir("/app");

  const createResult = await freestyle.vms.create({
    spec,
    idleTimeoutSeconds: 600,
    ports: [{ port: 443, targetPort }],
  });

  const vmId = createResult.vmId;
  const vm = createResult.vm;

  // domains may be on the result or we construct from vmId
  const rawDomains = (createResult as Record<string, unknown>).domains;
  console.log("[runtime] VM created:", {
    vmId,
    domains: rawDomains,
    allKeys: Object.keys(createResult),
  });

  // Install deps first
  await vm.js.install({ directory: "/app" });

  // Start the script in the background via nohup so exec returns immediately
  const runCmd =
    runtime === "deno"
      ? `${DENO_BIN} task ${script}`
      : `${BUN_BIN} run ${script}`;

  await vm.exec(
    `cd /app && HOST=0.0.0.0 PORT=${targetPort} nohup ${runCmd} > /tmp/app.log 2>&1 &`,
  );

  // Try to get domain from result
  let domain: string | null = null;
  if (Array.isArray(rawDomains) && rawDomains.length > 0) {
    domain = rawDomains[0];
  }

  // Fallback: try vms.get() to see if domain is assigned after creation
  if (!domain) {
    try {
      const vmInfo = await freestyle.vms.get({ vmId });
      const allVmInfo = vmInfo as Record<string, unknown>;
      console.log("[runtime] VM get() keys:", Object.keys(allVmInfo));
      console.log("[runtime] VM get() domains:", allVmInfo.domains);
      console.log(
        "[runtime] VM get() full:",
        JSON.stringify(
          allVmInfo,
          (key, value) => {
            if (key === "vm" || key === "exec" || typeof value === "function")
              return "[omitted]";
            return value;
          },
          2,
        ),
      );
      const infoDomains = allVmInfo.domains;
      if (Array.isArray(infoDomains) && infoDomains.length > 0) {
        domain = infoDomains[0];
      }
    } catch (e) {
      console.error("[runtime] Failed to get VM info:", e);
    }
  }

  // Last resort: construct domain from vmId (Freestyle convention)
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
