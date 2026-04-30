import type { Config } from "../types";
import { git } from "./git";

export function configureGitIdentity(config: Config): void {
  if (!config.gitUserName || !config.gitUserEmail) return;
  git(["config", "user.name", config.gitUserName], {
    cwd: config.appRoot,
  });
  git(["config", "user.email", config.gitUserEmail], {
    cwd: config.appRoot,
  });
}
