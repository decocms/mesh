import type { Freestyle } from "freestyle-sandboxes";
import { VmSpec } from "freestyle-sandboxes";
import { VmBun } from "@freestyle-sh/with-bun";
import type { FreestyleMetadata } from "./types";

const BUN_BIN = "/opt/bun/bin/bun";

export interface RunScriptResult {
  vmId: string;
  domain: string;
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

  const spec = new VmSpec()
    .with("js", new VmBun())
    .repo(metadata.freestyle_repo_id, "/app")
    .workdir("/app")
    .waitForReadySignal(true);

  const targetPort = metadata.preview_port ?? 3000;

  const { vm, vmId, domains } = await freestyle.vms.create({
    spec,
    idleTimeoutSeconds: 600,
    ports: [{ port: 443, targetPort }],
  });

  // Install deps first
  await vm.js.install({ directory: "/app" });

  // Start the script in the background via nohup so exec returns immediately
  await vm.exec(
    `cd /app && HOST=0.0.0.0 PORT=${targetPort} nohup ${BUN_BIN} run ${script} > /tmp/app.log 2>&1 &`,
  );

  return {
    vmId,
    domain: domains[0] ?? "",
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
