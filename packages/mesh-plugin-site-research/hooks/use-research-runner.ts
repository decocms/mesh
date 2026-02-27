import { OBJECT_STORAGE_BINDING } from "@decocms/bindings";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KEYS } from "../lib/query-keys";
import { synthesizeReport } from "../lib/report";
import { RESEARCH_STEPS } from "../lib/steps";
import { readFile, writeFile } from "../lib/storage";
import type { SessionMeta, StepContext, StepState } from "../lib/types";
import { useState } from "react";

export function generateSessionId(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  const urlHash = Math.abs(hash).toString(36);
  const ts = Date.now().toString(36);
  return `${urlHash}-${ts}`;
}

/**
 * Mutation hook that runs all research steps sequentially,
 * writing results to object storage. Supports resume from
 * partial state by checking which files already exist.
 */
export function useResearchRunner() {
  const { connectionId, toolCaller } =
    usePluginContext<typeof OBJECT_STORAGE_BINDING>();
  const queryClient = useQueryClient();
  const [stepStates, setStepStates] = useState<StepState[]>([]);

  const mutation = useMutation({
    mutationFn: async ({
      url,
      sessionId: providedSessionId,
      resume = false,
    }: {
      url: string;
      sessionId?: string;
      resume?: boolean;
    }): Promise<{ sessionId: string }> => {
      const sessionId = providedSessionId ?? generateSessionId(url);

      // Initialize step states
      const initialStates: StepState[] = RESEARCH_STEPS.map((step) => ({
        id: step.id,
        status: "pending",
      }));
      setStepStates(initialStates);

      // Write meta.json if starting fresh
      if (!resume) {
        const meta: SessionMeta = {
          url,
          sessionId,
          startedAt: new Date().toISOString(),
          status: "running",
        };
        await writeFile(toolCaller, sessionId, "meta.json", meta);
      }

      // Build step context with outputs collected along the way
      const outputs: Record<string, unknown> = {};

      // Only check for already-completed steps when resuming
      if (resume) {
        for (const step of RESEARCH_STEPS) {
          try {
            const data = await readFile(toolCaller, sessionId, step.outputFile);
            outputs[step.id] = data;
            setStepStates((prev) =>
              prev.map((s) =>
                s.id === step.id ? { ...s, status: "done" } : s,
              ),
            );
          } catch {
            // File doesn't exist yet — will be run
          }
        }
      }

      // Run each step
      for (const step of RESEARCH_STEPS) {
        // Skip already completed steps
        if (outputs[step.id]) continue;

        // Check dependencies
        const depsReady = (step.dependsOn ?? []).every(
          (dep) => outputs[dep] !== undefined,
        );
        if (!depsReady) {
          setStepStates((prev) =>
            prev.map((s) =>
              s.id === step.id ? { ...s, status: "skipped" } : s,
            ),
          );
          continue;
        }

        // Mark as running
        setStepStates((prev) =>
          prev.map((s) =>
            s.id === step.id
              ? { ...s, status: "running", startedAt: new Date().toISOString() }
              : s,
          ),
        );

        const ctx: StepContext = { url, sessionId, outputs };

        try {
          const input = step.buildInput(ctx);
          const result = await (
            toolCaller as (name: string, args: unknown) => Promise<unknown>
          )(step.toolName, input);

          // Write result to storage
          await writeFile(toolCaller, sessionId, step.outputFile, result);
          outputs[step.id] = result;

          setStepStates((prev) =>
            prev.map((s) =>
              s.id === step.id
                ? {
                    ...s,
                    status: "done",
                    completedAt: new Date().toISOString(),
                  }
                : s,
            ),
          );
        } catch (err) {
          const error = err instanceof Error ? err.message : "Unknown error";

          setStepStates((prev) =>
            prev.map((s) =>
              s.id === step.id
                ? {
                    ...s,
                    status: "failed",
                    error,
                    completedAt: new Date().toISOString(),
                  }
                : s,
            ),
          );

          // Optional steps don't block
          if (!step.optional) {
            throw new Error(`Step "${step.label}" failed: ${error}`);
          }
        }
      }

      // Synthesize final report
      setStepStates((prev) => [
        ...prev,
        {
          id: "report",
          status: "running",
          startedAt: new Date().toISOString(),
        },
      ]);

      try {
        const report = await synthesizeReport(toolCaller, sessionId, url);
        await writeFile(toolCaller, sessionId, "report.json", report);

        // Update meta status
        const meta: SessionMeta = {
          url,
          sessionId,
          startedAt: new Date().toISOString(),
          status: "completed",
        };
        await writeFile(toolCaller, sessionId, "meta.json", meta);

        setStepStates((prev) =>
          prev.map((s) =>
            s.id === "report"
              ? {
                  ...s,
                  status: "done",
                  completedAt: new Date().toISOString(),
                }
              : s,
          ),
        );
      } catch (err) {
        const error =
          err instanceof Error ? err.message : "Report synthesis failed";
        setStepStates((prev) =>
          prev.map((s) =>
            s.id === "report" ? { ...s, status: "failed", error } : s,
          ),
        );
        throw new Error(`Report synthesis failed: ${error}`);
      }

      // Invalidate queries
      queryClient.invalidateQueries({
        queryKey: KEYS.sessions(connectionId),
      });
      queryClient.invalidateQueries({
        queryKey: KEYS.sessionProgress(connectionId, sessionId),
      });

      return { sessionId };
    },
  });

  return {
    run: mutation.mutate,
    runAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error,
    stepStates,
  };
}
