import type { Freestyle } from "freestyle-sandboxes";
import { VmSpec } from "freestyle-sandboxes";
import { VmBun } from "@freestyle-sh/with-bun";
import { VmDeno } from "@freestyle-sh/with-deno";
import { VmWebTerminal } from "@freestyle-sh/with-web-terminal";
import type { FreestyleMetadata } from "./types";

const BUN_BIN = "/opt/bun/bin/bun";
const SCRIPT_NAME_PATTERN = /^[a-zA-Z0-9_:.-]+$/;

export interface RunScriptResult {
  vmId: string;
  domain: string | null;
  terminalDomain: string | null;
  appReady: boolean;
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

  if (!SCRIPT_NAME_PATTERN.test(script)) {
    throw new Error(
      `Invalid script name: "${script}". Only alphanumeric, dash, underscore, colon, and dot are allowed.`,
    );
  }

  if (metadata.freestyle_vm_id) {
    await freestyle.vms
      .delete({ vmId: metadata.freestyle_vm_id })
      .catch(() => {});
  }

  const runtime = metadata.runtime ?? "bun";
  const targetPort = metadata.preview_port ?? 3000;
  const repoId = metadata.freestyle_repo_id;

  // Wrapper script: installs deps then exec's the dev server
  // Using exec so the server process replaces bash — prevents ttyd restart loops
  const startScript =
    runtime === "deno"
      ? [
          "#!/bin/bash",
          "set -e",
          "cd /app",
          `export HOST=0.0.0.0`,
          `export PORT=${targetPort}`,
          "deno install",
          `exec deno task ${script}`,
        ].join("\n")
      : [
          "#!/bin/bash",
          "set -e",
          "cd /app",
          `export HOST=0.0.0.0`,
          `export PORT=${targetPort}`,
          `${BUN_BIN} install`,
          `exec ${BUN_BIN} run ${script}`,
        ].join("\n");

  const runtimeIntegration = runtime === "deno" ? new VmDeno() : new VmBun();
  const runtimeKey = runtime === "deno" ? "deno" : "js";

  const spec = new VmSpec()
    .with(runtimeKey, runtimeIntegration)
    .with(
      "terminal",
      new VmWebTerminal([
        {
          id: "main",
          command: "bash /tmp/start.sh",
          readOnly: true,
          cwd: "/app",
        },
      ] as const),
    )
    .repo(repoId, "/app")
    .workdir("/app");

  const result = await freestyle.vms.create({
    spec,
    additionalFiles: {
      "/tmp/start.sh": { content: startScript },
    },
    ports: [{ port: 443, targetPort }],
    idleTimeoutSeconds: 600,
  });

  const vmId = result.vmId;
  // biome-ignore lint: accessing terminal from dynamic VM result
  const vm = result.vm as any;

  console.log("[runtime] VM created:", { vmId });

  // Route the terminal to a public domain
  let terminalDomain: string | null = null;
  try {
    terminalDomain = `${vmId}-terminal.style.dev`;
    await vm.terminal.main.route({ domain: terminalDomain });
    console.log("[runtime] Terminal routed:", terminalDomain);
  } catch (e) {
    console.error("[runtime] Terminal routing failed:", e);
    terminalDomain = null;
  }

  // Get preview domain
  const rawDomains = (result as Record<string, unknown>).domains;
  let domain: string | null = null;
  if (Array.isArray(rawDomains) && rawDomains.length > 0) {
    domain = rawDomains[0];
  }
  if (!domain) {
    domain = `${vmId}.freestyle.sh`;
    console.log("[runtime] Constructed domain from vmId:", domain);
  }

  // Health-check: poll the app port until it responds (max 120s)
  const maxWait = 120_000;
  const startTime = Date.now();
  let appReady = false;
  while (Date.now() - startTime < maxWait) {
    try {
      const check = await vm.exec(
        `curl -s -o /dev/null -w '%{http_code}' http://localhost:${targetPort} 2>/dev/null || echo 000`,
      );
      if (check && String(check).trim() !== "000") {
        appReady = true;
        break;
      }
    } catch {
      // VM may not be ready yet
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log("[runtime] Final domain:", domain, "appReady:", appReady);

  return {
    vmId,
    domain,
    terminalDomain,
    appReady,
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
