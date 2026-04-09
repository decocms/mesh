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

  try {
    await repo.githubSync.enable({ githubRepoName: validated });
  } catch (e) {
    throw new Error(
      `GitHub sync enable failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const spec = new VmSpec()
    .with("js", new VmBun())
    .repo(repoId, "/app")
    .workdir("/app")
    .systemdService({
      name: "install-deps",
      mode: "oneshot",
      exec: ["bun install"],
      workdir: "/app",
      after: ["freestyle-git-sync.service"],
      wantedBy: ["multi-user.target"],
    })
    .waitForReadySignal(true)
    .snapshot();

  let vmId: string;
  let vm: { suspend(): Promise<unknown> };
  try {
    const result = await freestyle.vms.create(spec);
    vmId = result.vmId;
    vm = result.vm;
  } catch (e) {
    throw new Error(
      `VM creation failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  await vm.suspend();

  return {
    repoId,
    snapshotId: vmId,
    vmId,
    runtime: detection.runtime,
    scripts: detection.scripts,
    instructions: detection.instructions,
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
