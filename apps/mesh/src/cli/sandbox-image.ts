import { addLogEntry } from "./cli-store";

/**
 * If the resolved runner is docker, kick off an image presence check + build
 * in the background so the first VM_START on a fresh machine isn't blocked on
 * a cold `docker build`. Fire-and-forget — `DockerSandboxRunner.provision()`
 * awaits the same singleton, so any failure surfaces there with context.
 *
 * Skipped in production (image is expected to be registry-hosted) and when
 * `MESH_SANDBOX_IMAGE` points elsewhere (user opted into a registry image).
 */
export async function kickoffSandboxImageBuild(opts: {
  noTui: boolean;
}): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  if (process.env.MESH_SANDBOX_IMAGE) return;

  const { resolveRunnerKindFromEnv, ensureSandboxImage } = await import(
    "mesh-plugin-user-sandbox/runner"
  );

  let kind: "docker" | "freestyle";
  try {
    kind = resolveRunnerKindFromEnv();
  } catch {
    return;
  }
  if (kind !== "docker") return;

  const log = opts.noTui
    ? (line: string) => console.log(`[sandbox-image] ${line}`)
    : (line: string) =>
        addLogEntry({
          method: "",
          path: "",
          status: 0,
          duration: 0,
          timestamp: new Date(),
          rawLine: `[sandbox-image] ${line}`,
        });

  ensureSandboxImage({ onLog: log }).catch((err: unknown) => {
    log(`build failed: ${err instanceof Error ? err.message : String(err)}`);
  });
}
