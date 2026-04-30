import { addLogEntry } from "./cli-store";

/**
 * If the resolved runner is docker, kick off an image presence check + build
 * in the background so the first VM_START on a fresh machine isn't blocked on
 * a cold `docker build`. Fire-and-forget — `DockerSandboxRunner.provision()`
 * awaits the same singleton, so any failure surfaces there with context.
 *
 * Skipped in production (image is expected to be registry-hosted) and when
 * `STUDIO_SANDBOX_IMAGE` points elsewhere (user opted into a registry image).
 */
export async function kickoffSandboxImageBuild(opts: {
  noTui: boolean;
}): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  if (process.env.STUDIO_SANDBOX_IMAGE) return;

  const { resolveRunnerKindFromEnv, ensureSandboxImage } = await import(
    "@decocms/sandbox/runner"
  );

  let kind: string;
  try {
    kind = resolveRunnerKindFromEnv();
  } catch {
    // Best-effort kickoff: misconfigured env is surfaced by the actual
    // VM_START path; here we just skip the prebuild.
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
