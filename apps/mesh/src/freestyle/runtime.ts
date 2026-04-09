import type { Freestyle } from "freestyle-sandboxes";
import { VmSpec } from "freestyle-sandboxes";
import { VmBun } from "@freestyle-sh/with-bun";
import type { FreestyleMetadata } from "./types";

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
    .systemdService({
      name: "install-deps",
      mode: "oneshot",
      exec: ["bun install"],
      workdir: "/app",
      after: ["freestyle-git-sync.service"],
      wantedBy: ["multi-user.target"],
    })
    .snapshot();

  const { vmId, domains } = await freestyle.vms.create({
    snapshot: spec,
    idleTimeoutSeconds: 600,
    ports: [{ port: 443, targetPort: 3000 }],
    systemd: {
      services: [
        {
          name: "app-script",
          mode: "service",
          exec: [`bun run ${script}`],
          workdir: "/app",
          env: { HOST: "0.0.0.0", PORT: "3000" },
          after: ["install-deps.service"],
        },
      ],
    },
  });

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
