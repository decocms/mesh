/**
 * Research Layout
 *
 * Self-contained layout component for the site research plugin.
 * Handles connection filtering, plugin context setup, and renders
 * the research UI directly.
 *
 * Uses URL search params (?session=...) so session URLs are copyable.
 */

import { type Binder, type PluginContext } from "@decocms/bindings";
import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useMCPClientOptional,
  useProjectContext,
  type ConnectionEntity,
} from "@decocms/mesh-sdk";
import { PluginContextProvider } from "@decocms/mesh-sdk/plugins";
import { useNavigate, useSearch } from "@decocms/bindings/plugin-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Loading01, SearchLg, Settings01 } from "@untitledui/icons";
import { KEYS } from "../lib/query-keys";
import { PLUGIN_ID } from "../shared";
import { useResearchProgress } from "../hooks/use-research-progress";
import {
  generateSessionId,
  useResearchRunner,
} from "../hooks/use-research-runner";
import { RESEARCH_STEPS } from "../lib/steps";
import type { StepState } from "../lib/types";
import ResearchStartForm from "./research-start-form";
import ResearchProgress from "./research-progress";
import ResearchReport from "./research-report";
import ResearchList from "./research-list";

/**
 * Build effective step states by merging runner state (live) with
 * progress data (file-based). Runner state wins when the runner is active.
 */
function buildStepStates(
  runnerStates: StepState[],
  progress: { steps: { id: string; done: boolean }[] } | undefined,
  isRunning: boolean,
): StepState[] {
  if (isRunning && runnerStates.length > 0) {
    return runnerStates;
  }
  // Viewing a previous session — derive state from file existence
  return RESEARCH_STEPS.map((step) => {
    const progressStep = progress?.steps.find((s) => s.id === step.id);
    return {
      id: step.id,
      status: progressStep?.done ? "done" : ("pending" as const),
    };
  });
}

type PluginConfigOutput = {
  config: {
    id: string;
    projectId: string;
    pluginId: string;
    connectionId: string | null;
    settings: Record<string, unknown> | null;
  } | null;
};

/**
 * Inner content component, rendered inside PluginContextProvider.
 */
function ResearchContent() {
  const search = useSearch({ strict: false }) as { session?: string };
  const navigate = useNavigate();

  const sessionId = search.session ?? null;
  const setSessionId = (id: string | null) => {
    navigate({
      search: id ? { session: id } : {},
      replace: true,
    } as Parameters<typeof navigate>[0]);
  };

  const { data: progress } = useResearchProgress(sessionId);
  const runner = useResearchRunner();

  const handleAnalyze = (url: string) => {
    const newId = generateSessionId(url);
    setSessionId(newId);
    runner.run({ url, sessionId: newId });
  };

  const handleResume = (id: string) => {
    setSessionId(id);
    // TODO: could auto-trigger runner.run({ url, sessionId: id }) here
  };

  // If viewing a completed session, show the report
  if (sessionId && progress?.reportReady) {
    return (
      <ResearchReport sessionId={sessionId} onBack={() => setSessionId(null)} />
    );
  }

  // If runner is active or viewing an in-progress session, show progress
  if (runner.isPending || (sessionId && !progress?.reportReady)) {
    const effectiveSteps = buildStepStates(
      runner.stepStates,
      progress,
      runner.isPending,
    );

    return (
      <div className="h-full overflow-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <button
              type="button"
              onClick={() => setSessionId(null)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              &larr; Back
            </button>
          </div>
          <ResearchProgress
            stepStates={effectiveSteps}
            onViewReport={
              progress?.reportReady ? () => setSessionId(sessionId) : undefined
            }
          />
          {runner.error && (
            <div className="mt-4 p-3 rounded-lg bg-destructive/10 text-sm text-destructive">
              {runner.error.message}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Default: start form + session history
  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex flex-col items-center gap-6 mb-8">
          <div className="flex items-center justify-center size-12 rounded-xl bg-primary/10">
            <SearchLg size={24} className="text-primary" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold text-foreground">
              Site Research
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Enter a URL to analyze your site across SEO, performance, content,
              and more.
            </p>
          </div>
        </div>

        <ResearchStartForm
          onSubmit={handleAnalyze}
          isPending={runner.isPending}
        />

        <div className="mt-8">
          <ResearchList onSelect={handleResume} />
        </div>
      </div>
    </div>
  );
}

/**
 * Main layout exported as LayoutComponent.
 */
export default function ResearchLayout() {
  const { org, project } = useProjectContext();

  const selfClient = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  // Fetch connections including virtual ones (Virtual MCPs)
  const { data: allConnections } = useSuspenseQuery({
    queryKey: ["site-research", "connections", org.id],
    queryFn: async () => {
      const result = (await selfClient.callTool({
        name: "COLLECTION_CONNECTIONS_LIST",
        arguments: { limit: 200, include_virtual: true },
      })) as { structuredContent?: { items: ConnectionEntity[] } };
      return (result.structuredContent?.items ?? []) as ConnectionEntity[];
    },
    staleTime: 30_000,
  });

  const { data: pluginConfig, isLoading: isLoadingConfig } = useQuery({
    queryKey: KEYS.pluginConfig(project.id ?? "", PLUGIN_ID),
    queryFn: async () => {
      const result = (await selfClient.callTool({
        name: "PROJECT_PLUGIN_CONFIG_GET",
        arguments: { projectId: project.id, pluginId: PLUGIN_ID },
      })) as { structuredContent?: unknown };
      return (result.structuredContent ?? result) as PluginConfigOutput;
    },
    enabled: !!project.id,
  });

  const configuredConnectionId = pluginConfig?.config?.connectionId;
  const configuredConnection = configuredConnectionId
    ? allConnections.find(
        (c: ConnectionEntity) => c.id === configuredConnectionId,
      )
    : null;

  // MCP client for the configured connection
  const configuredClient = useMCPClientOptional({
    connectionId: configuredConnection?.id,
    orgId: org.id,
  });

  const orgContext = { id: org.id, slug: org.slug, name: org.name };

  if (isLoadingConfig) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loading01
          size={32}
          className="animate-spin text-muted-foreground mb-4"
        />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!configuredConnection) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8">
        <div className="flex flex-col items-center gap-2 text-center max-w-md">
          <Settings01 size={48} className="text-muted-foreground mb-2" />
          <h2 className="text-lg font-semibold">Plugin Not Configured</h2>
          <p className="text-sm text-muted-foreground">
            This plugin requires a connection to be configured. Go to project
            settings to select which integration to use.
          </p>
        </div>
      </div>
    );
  }

  const pluginContext: PluginContext<Binder> = {
    connectionId: configuredConnection.id,
    connection: {
      id: configuredConnection.id,
      title: configuredConnection.title,
      icon: configuredConnection.icon,
      description: configuredConnection.description,
      app_name: configuredConnection.app_name,
      app_id: configuredConnection.app_id,
      tools: configuredConnection.tools,
      metadata: configuredConnection.metadata,
    },
    toolCaller: ((toolName: string, args: unknown) =>
      configuredClient
        ? configuredClient
            .callTool({
              name: toolName,
              arguments: args as Record<string, unknown>,
            })
            .then((result) => {
              if (result.isError) {
                const msg =
                  Array.isArray(result.content) &&
                  result.content[0]?.type === "text"
                    ? result.content[0].text
                    : `Tool ${toolName} failed`;
                throw new Error(msg);
              }
              return result.structuredContent ?? result;
            })
        : Promise.reject(
            new Error("MCP client is not available"),
          )) as PluginContext<Binder>["toolCaller"],
    org: orgContext,
    session: null,
  };

  return (
    <PluginContextProvider value={pluginContext}>
      <div className="flex flex-col h-full overflow-hidden">
        <ResearchContent />
      </div>
    </PluginContextProvider>
  );
}
