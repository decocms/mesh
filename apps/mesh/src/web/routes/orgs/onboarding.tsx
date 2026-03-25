/**
 * Onboarding screen — shown after creating an organization.
 * Full-screen (no shell/sidebar). Split layout:
 *   Left: animated network illustration + progress
 *   Right: workflow steps (clean, centered, no descriptions)
 * "Start using workspace" button always available.
 */

import { useState } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { Button } from "@deco/ui/components/button.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  CheckCircle,
  ArrowRight,
  Globe06,
  Palette,
  Users01,
  ShoppingBag01,
  Target04,
  SearchLg,
} from "@untitledui/icons";
import { markOnboardingComplete } from "@/web/components/brand-context/context-ready-toast";

// ── Steps config ──────────────────────────────────────────────────────────────

type StepStatus = "pending" | "active" | "done";

interface WorkflowStep {
  id: string;
  label: string;
  icon: typeof Globe06;
  duration: number;
}

const STEPS: WorkflowStep[] = [
  { id: "website", label: "Scanning website", icon: Globe06, duration: 3200 },
  {
    id: "identity",
    label: "Extracting brand identity",
    icon: Palette,
    duration: 2800,
  },
  {
    id: "audience",
    label: "Analyzing target audience",
    icon: Users01,
    duration: 2400,
  },
  {
    id: "products",
    label: "Mapping products & services",
    icon: ShoppingBag01,
    duration: 2000,
  },
  {
    id: "market",
    label: "Researching market landscape",
    icon: Target04,
    duration: 2600,
  },
  { id: "seo", label: "Auditing SEO health", icon: SearchLg, duration: 1800 },
];

// ── Simulated workflow ────────────────────────────────────────────────────────

function useSimulatedWorkflow() {
  const [statuses, setStatuses] = useState<Record<string, StepStatus>>(() =>
    Object.fromEntries(STEPS.map((s) => [s.id, "pending"])),
  );
  const [started, setStarted] = useState(false);
  const allDone = Object.values(statuses).every((s) => s === "done");

  if (!started) {
    setStarted(true);
    let delay = 600;
    for (const step of STEPS) {
      const sid = step.id;
      const activate = delay;
      const done = delay + step.duration;
      setTimeout(
        () => setStatuses((p) => ({ ...p, [sid]: "active" })),
        activate,
      );
      setTimeout(() => setStatuses((p) => ({ ...p, [sid]: "done" })), done);
      delay = done + 300;
    }
  }

  return { statuses, allDone };
}

// ── Illustration ──────────────────────────────────────────────────────────────

function ContextIllustration({ allDone }: { allDone: boolean }) {
  const c = allDone ? "var(--color-emerald-500)" : "var(--color-blue-500)";

  const nodes = [
    { cx: 50, cy: 16, label: "site" },
    { cx: 86, cy: 34, label: "brand" },
    { cx: 86, cy: 66, label: "audience" },
    { cx: 50, cy: 84, label: "products" },
    { cx: 14, cy: 66, label: "market" },
    { cx: 14, cy: 34, label: "seo" },
  ];

  return (
    <div className="w-full max-w-[300px] aspect-square">
      <svg viewBox="0 0 100 100" className="size-full" aria-hidden>
        {/* Lines to center */}
        {nodes.map((n, i) => (
          <line
            key={`l-${i}`}
            x1={n.cx}
            y1={n.cy}
            x2="50"
            y2="50"
            stroke={c}
            strokeOpacity={0.12}
            strokeWidth="0.35"
            strokeDasharray={allDone ? "none" : "1.5 1.5"}
          >
            {!allDone && (
              <animate
                attributeName="stroke-dashoffset"
                values="3;0"
                dur="1.2s"
                repeatCount="indefinite"
                begin={`${i * 0.2}s`}
              />
            )}
          </line>
        ))}

        {/* Ring connections */}
        {nodes.map((n, i) => {
          const next = nodes[(i + 1) % nodes.length]!;
          return (
            <line
              key={`r-${i}`}
              x1={n.cx}
              y1={n.cy}
              x2={next.cx}
              y2={next.cy}
              stroke={c}
              strokeOpacity={0.06}
              strokeWidth="0.25"
            />
          );
        })}

        {/* Center hub */}
        <circle
          cx="50"
          cy="50"
          r="9"
          fill={c}
          fillOpacity={0.05}
          stroke={c}
          strokeOpacity={0.25}
          strokeWidth="0.5"
        />
        <text
          x="50"
          y="52"
          textAnchor="middle"
          fontSize="6"
          fontWeight="700"
          fill={c}
          fillOpacity={0.45}
        >
          {"{ }"}
        </text>

        {/* Outer nodes */}
        {nodes.map((n, i) => (
          <g key={`n-${i}`}>
            <circle
              cx={n.cx}
              cy={n.cy}
              r="5"
              fill={c}
              fillOpacity={0.04}
              stroke={c}
              strokeOpacity={0.18}
              strokeWidth="0.4"
            />
            <text
              x={n.cx}
              y={n.cy + 1.4}
              textAnchor="middle"
              fontSize="3"
              fill={c}
              fillOpacity={0.35}
              fontWeight="500"
            >
              {n.label}
            </text>
          </g>
        ))}

        {/* Pulse */}
        {!allDone && (
          <>
            <circle cx="50" cy="50" fill="none" stroke={c} strokeWidth="0.15">
              <animate
                attributeName="r"
                values="12;28"
                dur="3s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.25;0"
                dur="3s"
                repeatCount="indefinite"
              />
            </circle>
            <circle cx="50" cy="50" fill="none" stroke={c} strokeWidth="0.15">
              <animate
                attributeName="r"
                values="12;28"
                dur="3s"
                repeatCount="indefinite"
                begin="1.5s"
              />
              <animate
                attributeName="opacity"
                values="0.25;0"
                dur="3s"
                repeatCount="indefinite"
                begin="1.5s"
              />
            </circle>
          </>
        )}
      </svg>
    </div>
  );
}

// ── Step item ─────────────────────────────────────────────────────────────────

function StepItem({
  step,
  status,
  isLast,
}: {
  step: WorkflowStep;
  status: StepStatus;
  isLast: boolean;
}) {
  const Icon = step.icon;

  return (
    <div className="flex gap-4 items-start">
      {/* Timeline rail */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-500",
            status === "done"
              ? "bg-success/10 border-success/30 text-success"
              : status === "active"
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-muted/50 border-border text-muted-foreground/30",
          )}
        >
          {status === "done" ? <CheckCircle size={18} /> : <Icon size={18} />}
        </div>
        {!isLast && (
          <div
            className={cn(
              "w-px h-6 transition-colors duration-500",
              status === "done" ? "bg-success/25" : "bg-border",
            )}
          />
        )}
      </div>

      {/* Label */}
      <div className="flex items-center gap-2.5 h-10">
        <p
          className={cn(
            "text-[15px] font-medium transition-colors duration-300",
            status === "pending"
              ? "text-muted-foreground/40"
              : "text-foreground",
          )}
        >
          {step.label}
        </p>
        {status === "active" && (
          <div className="flex gap-[3px]">
            {[0, 0.2, 0.4].map((d) => (
              <div
                key={d}
                className="size-1.5 rounded-full bg-primary/70 animate-pulse"
                style={{ animationDelay: `${d}s` }}
              />
            ))}
          </div>
        )}
        {status === "done" && (
          <CheckCircle size={14} className="text-success/60" />
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const { org } = useParams({ strict: false }) as { org: string };
  const navigate = useNavigate();
  const { statuses, allDone } = useSimulatedWorkflow();

  const doneCount = Object.values(statuses).filter((s) => s === "done").length;

  return (
    <div className="flex h-screen bg-background">
      {/* ── Left panel ─────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col items-center justify-center w-[44%] bg-muted/20 border-r border-border">
        <ContextIllustration allDone={allDone} />

        <div className="mt-10 text-center max-w-[260px]">
          <p className="text-base font-semibold text-foreground">
            {allDone
              ? "Your brand context is ready"
              : "Building your brand context"}
          </p>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            {allDone
              ? "All agents now have deep knowledge of your brand"
              : "Analyzing your website to give every agent full context"}
          </p>
        </div>

        {/* Progress */}
        <div className="w-52 mt-8">
          <div className="h-1 rounded-full bg-border overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700 ease-out",
                allDone ? "bg-success" : "bg-primary",
              )}
              style={{
                width: `${(doneCount / STEPS.length) * 100}%`,
              }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground text-center mt-2 tabular-nums">
            {doneCount} of {STEPS.length} complete
          </p>
        </div>
      </div>

      {/* ── Right panel ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col">
        {/* Scrollable content */}
        <div className="flex-1 flex items-center justify-center overflow-y-auto px-8 sm:px-16">
          <div className="w-full max-w-sm py-12">
            <div className="mb-10">
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                Setting up your workspace
              </h1>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                We're gathering context from your website so every agent
                understands your brand from day one.
              </p>
            </div>

            <div>
              {STEPS.map((step, idx) => (
                <StepItem
                  key={step.id}
                  step={step}
                  status={statuses[step.id] ?? "pending"}
                  isLast={idx === STEPS.length - 1}
                />
              ))}
            </div>

            {allDone && (
              <div className="mt-8 rounded-xl border border-success/20 bg-success/[0.04] px-4 py-3.5">
                <div className="flex items-center gap-2.5">
                  <CheckCircle size={16} className="text-success shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Brand context complete
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Review and edit anytime in Settings
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-8 py-6 sm:px-16">
          <div className="max-w-sm mx-auto flex items-center justify-between gap-6">
            <p className="text-[13px] text-muted-foreground leading-snug">
              {allDone
                ? "Everything is ready — let's go!"
                : "Context keeps building in the background. We'll notify you when it's done."}
            </p>
            <Button
              size="lg"
              onClick={() => {
                markOnboardingComplete();
                navigate({ to: "/$org", params: { org } });
              }}
              className="gap-2 shrink-0"
            >
              {allDone ? "Go to workspace" : "Start using workspace"}
              <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
