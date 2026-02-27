import { OBJECT_STORAGE_BINDING } from "@decocms/bindings";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { useQuery } from "@tanstack/react-query";
import { KEYS } from "../lib/query-keys";
import { RESEARCH_STEPS } from "../lib/steps";
import { fileExists } from "../lib/storage";

export interface StepProgress {
  id: string;
  label: string;
  done: boolean;
  optional: boolean;
}

export interface SessionProgress {
  steps: StepProgress[];
  reportReady: boolean;
  allDone: boolean;
}

/**
 * Check which step output files exist for a given session.
 * Used to determine progress and detect resume points.
 */
export function useResearchProgress(sessionId: string | null) {
  const { connectionId, toolCaller } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();

  return useQuery({
    queryKey: KEYS.sessionProgress(connectionId, sessionId ?? ""),
    queryFn: async (): Promise<SessionProgress> => {
      if (!sessionId) {
        return { steps: [], reportReady: false, allDone: false };
      }

      const steps: StepProgress[] = await Promise.all(
        RESEARCH_STEPS.map(async (step) => ({
          id: step.id,
          label: step.label,
          done: await fileExists(toolCaller, sessionId, step.outputFile),
          optional: step.optional ?? false,
        })),
      );

      const reportReady = await fileExists(
        toolCaller,
        sessionId,
        "report.json",
      );

      const requiredSteps = steps.filter((s) => !s.optional);
      const allDone = reportReady || requiredSteps.every((s) => s.done);

      return { steps, reportReady, allDone };
    },
    enabled: !!sessionId,
    staleTime: 10 * 1000,
  });
}
