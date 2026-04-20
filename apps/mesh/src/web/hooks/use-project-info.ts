/**
 * Hook for fetching project info and dev server state.
 * Only active when running in project mode (publicConfig.projectDir is set).
 */

import { useQuery } from "@tanstack/react-query";
import { KEYS } from "@/web/lib/query-keys";
import { usePublicConfig } from "./use-public-config";

export interface ProjectScanResult {
  projectDir: string;
  projectName: string;
  framework: string | null;
  packageManager: string;
  devCommand: string;
  devPort: number;
  buildCommand: string | null;
  deployTarget: string | null;
  configFiles: string[];
  hasGit: boolean;
  contentDirs: Array<{
    path: string;
    type: "blog" | "content" | "docs";
    configFile: string | null;
  }>;
}

export interface DevServerState {
  status: "stopped" | "starting" | "running" | "error";
  port: number | null;
  url: string | null;
  pid: number | null;
  error: string | null;
  logs: string[];
}

export interface ProjectInfo {
  scan: ProjectScanResult;
  devServer: DevServerState;
}

export function useProjectInfo() {
  const config = usePublicConfig();
  return useQuery<ProjectInfo>({
    queryKey: KEYS.projectInfo(),
    queryFn: async () => {
      const response = await fetch("/api/project");
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      return { scan: data.scan, devServer: data.devServer };
    },
    refetchInterval: 5000,
    enabled: !!config.projectDir,
  });
}

export function useDevServerState() {
  const config = usePublicConfig();
  return useQuery<DevServerState>({
    queryKey: KEYS.projectDevServer(),
    queryFn: async () => {
      const response = await fetch("/api/project/dev-server");
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      return data.devServer;
    },
    refetchInterval: 3000,
    enabled: !!config.projectDir,
  });
}
