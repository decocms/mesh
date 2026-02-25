/**
 * Post-Login Interview Page — /onboard-interview?org=<orgSlug>&token=<diagnosticToken>
 *
 * Shown after org setup (redirected from /onboard-setup after claim success).
 * Runs a focused 3-question chat interview about goals and challenges using
 * the existing decopilot stream infrastructure with a structured onboarding
 * system prompt. Persists results to the backend after completion.
 *
 * Auth check: handled internally (not via shell layout).
 * Pattern: same as /onboard-setup.
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch, Navigate } from "@tanstack/react-router";
import { cn } from "@deco/ui/lib/utils.ts";
import { useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { authClient } from "@/web/lib/auth-client";
import { KEYS } from "@/web/lib/query-keys";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import type { AgentRecommendation } from "@/diagnostic/types";

// ============================================================================
// Onboarding System Prompt
// ============================================================================

const ONBOARDING_INTERVIEW_SYSTEM_PROMPT = `You are an onboarding consultant for e-commerce stores. Your role is to understand the user's business goals and challenges so you can recommend the right AI agents for their store.

CRITICAL RULES:
1. Ask EXACTLY 3 questions, ONE at a time. Never ask two questions at once.
2. Question 1: Their top business goal for the next 3 months (e.g., increase conversions, reduce cart abandonment, improve SEO)
3. Question 2: Their biggest operational challenge right now (e.g., managing product catalog, slow site speed, poor mobile experience)
4. Question 3: What they would automate first if they could (e.g., product descriptions, price optimization, customer support)
5. Keep each question to 1-2 sentences. Be conversational, not robotic.
6. Reference their storefront data from the diagnostic when relevant (e.g., mention their LCP score if asking about performance).
7. After receiving the 3rd answer, respond with a warm acknowledgment and then output EXACTLY this format on a new line:

[INTERVIEW_COMPLETE]
{"goals": ["<goal from answer 1>"], "challenges": ["<challenge from answer 2>"], "priorities": ["<automation priority from answer 3>"]}

Do NOT add any text after the JSON. The JSON must be valid and on a single line immediately after [INTERVIEW_COMPLETE].`;

// ============================================================================
// Types
// ============================================================================

interface DiagnosticSessionData {
  token: string;
  url: string;
  status: string;
  results: {
    webPerformance?: {
      lcp?: { value: number; rating: string };
      mobileScore?: number;
      desktopScore?: number;
    } | null;
    seo?: {
      title?: string;
      metaDescription?: string;
    } | null;
    techStack?: {
      platform?: { name: string };
    } | null;
    companyContext?: {
      description?: string;
    } | null;
  };
}

interface AllowedModelsResponse {
  [connectionId: string]: {
    thinking?: {
      id: string;
      provider?: string;
      capabilities?: { vision?: boolean; text?: boolean; tools?: boolean };
      limits?: { contextWindow?: number; maxOutputTokens?: number };
    };
  };
}

interface InterviewResults {
  goals: string[];
  challenges: string[];
  priorities: string[];
}

// ============================================================================
// Helpers
// ============================================================================

function buildDiagnosticSummary(session: DiagnosticSessionData): string {
  const lines: string[] = [];

  if (session.url) {
    lines.push(`Storefront URL: ${session.url}`);
  }

  const perf = session.results.webPerformance;
  if (perf) {
    if (perf.mobileScore !== undefined) {
      lines.push(
        `Mobile Performance Score: ${perf.mobileScore}/100${perf.mobileScore < 50 ? " (needs improvement)" : perf.mobileScore < 90 ? " (average)" : " (good)"}`,
      );
    }
    if (perf.lcp) {
      lines.push(
        `Largest Contentful Paint: ${Math.round(perf.lcp.value)}ms (${perf.lcp.rating})`,
      );
    }
  }

  const tech = session.results.techStack;
  if (tech?.platform) {
    lines.push(`Platform: ${tech.platform.name}`);
  }

  const seo = session.results.seo;
  if (seo) {
    const seoIssues: string[] = [];
    if (!seo.metaDescription) seoIssues.push("missing meta description");
    if (!seo.title) seoIssues.push("missing page title");
    if (seoIssues.length > 0) {
      lines.push(`SEO issues: ${seoIssues.join(", ")}`);
    }
  }

  const ctx = session.results.companyContext;
  if (ctx?.description) {
    const firstSentence = ctx.description.split(/[.!?]/)[0]?.trim();
    if (firstSentence) {
      lines.push(`Store overview: ${firstSentence}`);
    }
  }

  return lines.join("\n");
}

function parseInterviewResults(text: string): InterviewResults | null {
  const marker = "[INTERVIEW_COMPLETE]";
  const markerIdx = text.indexOf(marker);
  if (markerIdx === -1) return null;

  const jsonPart = text.slice(markerIdx + marker.length).trim();
  const jsonMatch = jsonPart.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    return {
      goals: Array.isArray(parsed.goals)
        ? (parsed.goals as string[])
        : [String(parsed.goals ?? "")],
      challenges: Array.isArray(parsed.challenges)
        ? (parsed.challenges as string[])
        : [String(parsed.challenges ?? "")],
      priorities: Array.isArray(parsed.priorities)
        ? (parsed.priorities as string[])
        : [String(parsed.priorities ?? "")],
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Spinner icon
// ============================================================================

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn("animate-spin", className)}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ============================================================================
// Chat message components
// ============================================================================

function AssistantMessage({ text }: { text: string }) {
  // Strip [INTERVIEW_COMPLETE] marker and JSON from display
  const markerIdx = text.indexOf("[INTERVIEW_COMPLETE]");
  const displayText = markerIdx > -1 ? text.slice(0, markerIdx).trim() : text;

  if (!displayText) return null;

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-sm text-foreground">
        {displayText}
      </div>
    </div>
  );
}

function UserMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-brand px-4 py-3 text-sm text-brand-foreground">
        {text}
      </div>
    </div>
  );
}

// ============================================================================
// Recommendation card components
// ============================================================================

function RecommendationCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-lg bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/3 rounded bg-muted" />
          <div className="h-3 w-2/3 rounded bg-muted" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-3 w-4/5 rounded bg-muted" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-1/4 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
      </div>
      <div className="mt-5 h-10 w-full rounded-lg bg-muted" />
    </div>
  );
}

function AgentRecommendationCard({
  recommendation,
  org,
}: {
  recommendation: AgentRecommendation;
  org: string;
}) {
  const connectionsUrl = `/${org}/org-admin/connections?add=true`;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="shrink-0">
          <IntegrationIcon
            icon={recommendation.agentIcon}
            name={recommendation.agentTitle}
            size="sm"
            fallbackIcon={
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
            }
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground">
            {recommendation.agentTitle}
          </h3>
          {recommendation.agentDescription && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
              {recommendation.agentDescription}
            </p>
          )}
        </div>
      </div>

      {/* Recommendation reason */}
      <div className="mt-4 flex items-start gap-2">
        <svg
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
        <p className="text-sm text-foreground">{recommendation.reason}</p>
      </div>

      {/* Required connections */}
      {recommendation.requiredConnections.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Connections needed
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {recommendation.requiredConnections.map((conn) => (
              <li key={conn.connectionId} className="flex items-center gap-2">
                {conn.isConfigured ? (
                  <>
                    <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
                    <span className="text-sm text-muted-foreground">
                      {conn.title}
                    </span>
                    <span className="text-xs text-green-600">Connected</span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                    <span className="text-sm text-muted-foreground">
                      {conn.title}
                    </span>
                    <a
                      href={connectionsUrl}
                      className="text-xs font-medium text-brand underline-offset-2 hover:underline"
                    >
                      Connect
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Hire button */}
      <div className="mt-5">
        <a
          href={connectionsUrl}
          className="block w-full rounded-lg bg-brand px-4 py-2.5 text-center text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90"
        >
          Hire this agent
        </a>
      </div>
    </div>
  );
}

// ============================================================================
// Recommendations view
// ============================================================================

function RecommendationsView({
  org,
  token,
  organizationId,
}: {
  org: string;
  token: string;
  organizationId: string | null | undefined;
}) {
  const { data: recommendations, isLoading } = useQuery<AgentRecommendation[]>({
    queryKey: KEYS.onboardingRecommendations(token),
    queryFn: () =>
      fetch(
        `/api/onboarding/recommendations?token=${encodeURIComponent(token)}&organizationId=${encodeURIComponent(organizationId ?? "")}`,
      )
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then(
          (data) =>
            (data as { recommendations: AgentRecommendation[] })
              .recommendations,
        ),
    enabled: !!token && !!organizationId,
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background px-4 py-6">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-2xl font-bold text-foreground">
            Recommended agents for your store
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Based on your diagnostic results and goals, we recommend hiring
            these agents:
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-8">
        <div className="mx-auto max-w-2xl">
          {isLoading ? (
            <div className="space-y-4">
              <RecommendationCardSkeleton />
              <RecommendationCardSkeleton />
              <RecommendationCardSkeleton />
            </div>
          ) : !recommendations || recommendations.length === 0 ? (
            // Empty state
            <div className="rounded-xl border border-border bg-card p-8 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <svg
                  className="h-6 w-6 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-foreground">
                No agent recommendations yet
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Your team doesn&apos;t have any agents configured. You can add
                agents later from the dashboard.
              </p>
              <button
                type="button"
                onClick={() => {
                  window.location.href = `/${org}`;
                }}
                className="mt-6 inline-flex items-center rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90"
              >
                Go to dashboard
              </button>
            </div>
          ) : (
            // Recommendation cards
            <div className="space-y-4">
              {recommendations.map((rec) => (
                <AgentRecommendationCard
                  key={rec.agentId}
                  recommendation={rec}
                  org={org}
                />
              ))}
            </div>
          )}

          {/* Skip / footer */}
          <div className="mt-8 text-center">
            <a
              href={`/${org}`}
              className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Skip for now
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main page
// ============================================================================

export default function OnboardInterviewPage() {
  const { org, token, step } = useSearch({ from: "/onboard-interview" });

  const session = authClient.useSession();

  const [inputValue, setInputValue] = useState("");
  const [hasSentFirstMessage, setHasSentFirstMessage] = useState(false);
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const threadIdRef = useRef<string>(crypto.randomUUID());

  // ── Guard: not authenticated ─────────────────────────────────────────────
  if (!session.isPending && !session.data) {
    const loginUrl = token
      ? `/login?next=${encodeURIComponent(`/onboard-interview?org=${org}&token=${token}`)}`
      : "/login";
    return <Navigate to={loginUrl as "/"} />;
  }

  // ── Guard: missing required params ───────────────────────────────────────
  if (!session.isPending && session.data && (!org || !token)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-foreground">Setup required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Please complete the diagnostic and org setup first.
          </p>
          <a
            href="/onboarding"
            className="mt-6 inline-flex items-center rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90"
          >
            Run a diagnostic
          </a>
        </div>
      </div>
    );
  }

  // ── Load diagnostic session ───────────────────────────────────────────────
  const { data: diagnosticSession } = useQuery<DiagnosticSessionData>({
    queryKey: KEYS.diagnosticSession(token ?? ""),
    queryFn: () =>
      fetch(`/api/diagnostic/session/${encodeURIComponent(token ?? "")}`).then(
        (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        },
      ),
    enabled: !!token && !!session.data,
    retry: false,
  });

  // ── Load allowed models ───────────────────────────────────────────────────
  const { data: allowedModels } = useQuery<AllowedModelsResponse>({
    queryKey: KEYS.interviewModels(org ?? ""),
    queryFn: () =>
      fetch(`/api/${org}/decopilot/allowed-models`).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    enabled: !!org && !!session.data,
    retry: false,
  });

  // ── Resolve first available model ─────────────────────────────────────────
  const firstModel = allowedModels
    ? (() => {
        const entries = Object.entries(allowedModels);
        if (entries.length === 0) return null;
        const firstEntry = entries[0];
        if (!firstEntry) return null;
        const [connectionId, modelInfo] = firstEntry;
        if (!modelInfo?.thinking) return null;
        return {
          connectionId,
          thinking: modelInfo.thinking,
        };
      })()
    : null;

  // ── Decopilot Virtual MCP ID (uses active org ID) ─────────────────────────
  const activeOrgId = session.data?.session?.activeOrganizationId;
  const decopilotAgentId = activeOrgId ? `decopilot_${activeOrgId}` : null;

  // ── Persist interview results ─────────────────────────────────────────────
  const persistMutation = useMutation({
    mutationFn: (results: InterviewResults) =>
      fetch("/api/onboarding/interview-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          organizationId: activeOrgId ?? "",
          ...results,
        }),
      }).then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: "Request failed" }));
          throw new Error(
            (err as { error?: string }).error ?? `HTTP ${r.status}`,
          );
        }
        return r.json();
      }),
    onSuccess: () => {
      window.location.href = `/onboard-interview?org=${org}&token=${token}&step=recommendations`;
    },
  });

  // ── Chat transport ────────────────────────────────────────────────────────
  const transport =
    org && firstModel
      ? new DefaultChatTransport({
          api: `/api/${org}/decopilot/stream`,
          credentials: "include",
          prepareSendMessagesRequest: ({ messages, requestMetadata }) => {
            const meta = (requestMetadata ?? {}) as {
              system?: string;
              agent?: unknown;
              models?: unknown;
              thread_id?: string;
            };
            const systemMessage = meta.system
              ? {
                  id: crypto.randomUUID(),
                  role: "system" as const,
                  parts: [{ type: "text" as const, text: meta.system }],
                }
              : null;
            const userMsg = messages.slice(-1);
            const allMessages = systemMessage
              ? [systemMessage, ...userMsg]
              : userMsg;
            return {
              body: {
                messages: allMessages,
                agent: meta.agent,
                models: meta.models,
                thread_id: meta.thread_id,
              },
            };
          },
        })
      : null;

  // ── useChat ───────────────────────────────────────────────────────────────
  const { messages, sendMessage, status } = useChat<UIMessage>({
    transport: transport ?? undefined,
    onFinish: ({ message }) => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

      const text = (message.parts as Array<{ type: string; text?: string }>)
        .filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join("");

      const results = parseInterviewResults(text);
      if (results) {
        setInterviewComplete(true);
        setAnalyzing(true);
        persistMutation.mutate(results);
      }
    },
  });

  const isStreaming = status === "streaming" || status === "submitted";
  const userMessageCount = messages.filter((m) => m.role === "user").length;
  const questionNumber = Math.min(userMessageCount + 1, 3);

  // ── Send initial message ──────────────────────────────────────────────────
  const sendInitialMessage = () => {
    if (hasSentFirstMessage || !firstModel || !decopilotAgentId) return;
    if (!diagnosticSession) return;

    setHasSentFirstMessage(true);

    const summary = buildDiagnosticSummary(diagnosticSession);
    const initialUserText = `I just ran a diagnostic on my storefront (${diagnosticSession.url}). Here's what we found:\n\n${summary}\n\nHelp me set up the right AI agents for my store.`;

    const userMessage: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text: initialUserText }],
    };

    sendMessage(userMessage, {
      metadata: {
        system: ONBOARDING_INTERVIEW_SYSTEM_PROMPT,
        agent: {
          id: decopilotAgentId,
          mode: "passthrough",
        },
        models: firstModel,
        thread_id: threadIdRef.current,
      },
    });
  };

  // ── Send subsequent user messages ─────────────────────────────────────────
  const handleSend = () => {
    const text = inputValue.trim();
    if (!text || !firstModel || !decopilotAgentId) return;
    if (isStreaming || interviewComplete) return;

    setInputValue("");

    const userMessage: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text }],
    };

    sendMessage(userMessage, {
      metadata: {
        system: ONBOARDING_INTERVIEW_SYSTEM_PROMPT,
        agent: {
          id: decopilotAgentId,
          mode: "passthrough",
        },
        models: firstModel,
        thread_id: threadIdRef.current,
      },
    });

    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (session.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <SpinnerIcon className="h-6 w-6 text-brand" />
      </div>
    );
  }

  // ── No models available ───────────────────────────────────────────────────
  if (allowedModels !== undefined && !firstModel) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-foreground">
            No AI models configured
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your organization needs at least one AI model connection to use the
            interview. Please configure a model in your settings.
          </p>
          <a
            href={`/${org}`}
            className="mt-6 inline-flex items-center rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    );
  }

  // ── Recommendations view (plan 03) ────────────────────────────────────────
  if (step === "recommendations") {
    return (
      <RecommendationsView
        org={org ?? ""}
        token={token ?? ""}
        organizationId={activeOrgId}
      />
    );
  }

  // ── Chat messages to display (skip first user message = diagnostic seed) ──
  const chatDisplayMessages = messages.filter((m, i) => {
    if (m.role === "user" && i === 0) return false;
    return true;
  });

  // ── Main interview UI ─────────────────────────────────────────────────────
  const storefrontUrl = diagnosticSession?.url ?? "";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background px-4 py-4">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-lg font-semibold text-foreground">
            Tell us about your store
          </h1>
          {storefrontUrl && (
            <p className="mt-0.5 text-xs text-muted-foreground break-all">
              {storefrontUrl}
            </p>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {!hasSentFirstMessage && (
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                We'll ask you 3 focused questions to recommend the right agents
                for your store.
              </p>
              <button
                type="button"
                onClick={sendInitialMessage}
                disabled={
                  !firstModel ||
                  !decopilotAgentId ||
                  !diagnosticSession ||
                  isStreaming
                }
                className={cn(
                  "rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground transition-opacity hover:opacity-90",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {isStreaming ? (
                  <span className="flex items-center gap-2">
                    <SpinnerIcon className="h-4 w-4" />
                    Starting interview...
                  </span>
                ) : (
                  "Start interview"
                )}
              </button>
            </div>
          )}

          {chatDisplayMessages.map((message) => {
            const text = message.parts
              .filter((p) => p.type === "text")
              .map((p) => (p as { type: "text"; text: string }).text)
              .join("");

            if (message.role === "assistant") {
              return <AssistantMessage key={message.id} text={text} />;
            }
            return <UserMessage key={message.id} text={text} />;
          })}

          {isStreaming && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
                <span className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
                </span>
              </div>
            </div>
          )}

          {analyzing && (
            <div className="flex justify-center py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <SpinnerIcon className="h-4 w-4 text-brand" />
                Analyzing your responses...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area — shown after the interview starts */}
      {hasSentFirstMessage && !interviewComplete && (
        <div className="border-t border-border bg-background px-4 py-4">
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {userMessageCount < 3
                  ? `Question ${questionNumber} of 3`
                  : "Wrapping up..."}
              </span>
            </div>

            <div className="flex items-end gap-2">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your answer..."
                disabled={isStreaming || interviewComplete}
                rows={2}
                className={cn(
                  "flex-1 resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-brand",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={
                  !inputValue.trim() || isStreaming || interviewComplete
                }
                className={cn(
                  "shrink-0 rounded-xl bg-brand p-3 text-brand-foreground transition-opacity hover:opacity-90",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
                aria-label="Send message"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
