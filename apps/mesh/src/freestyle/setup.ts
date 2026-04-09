import type { Freestyle } from "freestyle-sandboxes";
import { VmSpec } from "freestyle-sandboxes";
import { VmBun } from "@freestyle-sh/with-bun";
import { type RepoFileReader, GitHubFileReader, detectRepo } from "./detect";
import { validateRepoUrl, type FreestyleMetadata } from "./types";

export interface SetupResult {
  repoId: string;
  snapshotId: string;
  vmId: string;
  runtime: "bun";
  scripts: Record<string, string>;
  instructions: string | null;
  autorun: string | null;
  preview_port: number | null;
}

export async function setupRepo(
  freestyle: Freestyle,
  repoUrl: string,
  reader?: RepoFileReader,
): Promise<SetupResult> {
  const validated = validateRepoUrl(repoUrl);
  const fileReader = reader ?? new GitHubFileReader();

  let detection: Awaited<ReturnType<typeof detectRepo>>;
  try {
    detection = await detectRepo(validated, fileReader);
  } catch (e) {
    throw new Error(
      `Detection failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let repoId: string;
  let repo: Awaited<ReturnType<typeof freestyle.git.repos.create>>["repo"];
  try {
    const result = await freestyle.git.repos.create({
      source: { url: `https://github.com/${validated}` },
    });
    repoId = result.repoId;
    repo = result.repo;
  } catch (e) {
    throw new Error(
      `Freestyle repo creation failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // GitHub sync is optional — requires a GitHub App to be installed.
  // If it fails, the repo was already cloned via source URL above.
  try {
    await repo.githubSync.enable({ githubRepoName: validated });
  } catch {
    // Silently skip — sync can be enabled later when GitHub App is configured
  }

  const spec = new VmSpec()
    .with("js", new VmBun())
    .repo(repoId, "/app")
    .workdir("/app")
    .waitForReadySignal(true);

  let vmId: string;
  let vm: Awaited<ReturnType<typeof freestyle.vms.create<{ js: VmBun }>>>;
  try {
    vm = await freestyle.vms.create(spec);
    vmId = vm.vmId;
  } catch (e) {
    throw new Error(
      `VM creation failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  try {
    await vm.vm.js.install({ directory: "/app" });
  } catch (e) {
    throw new Error(
      `Dependency install failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  await vm.vm.suspend();

  return {
    repoId,
    snapshotId: vmId,
    vmId,
    runtime: detection.runtime,
    scripts: detection.scripts,
    instructions: detection.instructions,
    autorun: detection.autorun ?? null,
    preview_port: detection.preview_port ?? null,
  };
}

export async function cleanupFreestyleResources(
  freestyle: Freestyle,
  metadata: FreestyleMetadata,
): Promise<void> {
  const promises: Promise<unknown>[] = [];

  if (metadata.freestyle_vm_id) {
    promises.push(
      freestyle.vms.delete({ vmId: metadata.freestyle_vm_id }).catch(() => {}),
    );
  }

  if (metadata.freestyle_repo_id) {
    promises.push(
      freestyle.git.repos
        .delete({ repoId: metadata.freestyle_repo_id })
        .catch(() => {}),
    );
  }

  await Promise.all(promises);
}
