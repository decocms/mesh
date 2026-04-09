export interface FreestyleMetadata {
  repo_url?: string | null;
  freestyle_repo_id?: string | null;
  freestyle_vm_id?: string | null;
  freestyle_snapshot_id?: string | null;
  runtime?: "bun" | null;
  runtime_status?: "idle" | "installing" | "running" | null;
  running_script?: string | null;
  vm_domain?: string | null;
  scripts?: Record<string, string> | null;
  preview_port?: number | null;
  autorun?: string | null;
}

export const REPO_URL_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

export function validateRepoUrl(repoUrl: string): string {
  const trimmed = repoUrl.trim();
  if (!REPO_URL_PATTERN.test(trimmed)) {
    throw new Error(
      `Invalid repo URL: "${trimmed}". Must be in "owner/repo" format.`,
    );
  }
  return trimmed;
}
