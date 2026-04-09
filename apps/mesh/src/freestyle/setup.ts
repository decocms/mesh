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

  const detection = await detectRepo(validated, fileReader);

  const { repoId, repo } = await freestyle.git.repos.create({
    source: { url: `https://github.com/${validated}` },
  });

  await repo.githubSync.enable({ githubRepoName: validated });

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

  const { vm, vmId } = await freestyle.vms.create(spec);

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
