"use client";

import { AgentAvatar } from "@/web/components/agent-icon.tsx";
import { AgentConnectionsPreview } from "@/web/components/connections/agent-connections-preview.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { useProjectContext } from "@decocms/mesh-sdk";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { Suspense, useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getEffectiveState } from "./utils.tsx";

// ---------------------------------------------------------------------------
// Passport certification text — repeated to fill the card background
// ---------------------------------------------------------------------------

const PASSPORT_TEXT =
  "This document certifies that the bearer agent has been granted authorized access to the tools and capabilities described herein. The agent is permitted to operate within the scope defined by its instructions and shall act in accordance with the constraints set forth by the issuing organization. This credential remains valid for the duration of the agent's active status. Unauthorized modification of this agent's permissions or scope is prohibited. The issuing authority reserves the right to revoke access at any time. All actions performed by this agent are subject to audit and review by the organization administrator. ";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentData {
  id: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  metadata?: { instructions?: string | null };
  connections?: Array<{ connection_id: string }>;
}

interface AgentPassportCardProps {
  part: ToolUIPart | DynamicToolUIPart;
}

// ---------------------------------------------------------------------------
// Output parser
// ---------------------------------------------------------------------------

function parseAgentFromOutput(raw: unknown): AgentData | null {
  if (!raw) return null;

  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    if (obj.item && typeof obj.item === "object") {
      const item = obj.item as Record<string, unknown>;
      if (typeof item.id === "string" && typeof item.title === "string") {
        return item as unknown as AgentData;
      }
    }

    if (Array.isArray(obj.content)) {
      const textPart = (obj.content as Array<Record<string, unknown>>).find(
        (c) => c.type === "text" && typeof c.text === "string",
      );
      if (textPart) {
        return parseAgentFromOutput(safeJsonParse(textPart.text as string));
      }
    }
  }

  if (typeof raw === "string") {
    return parseAgentFromOutput(safeJsonParse(raw));
  }

  return null;
}

function safeJsonParse(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentPassportCard({ part }: AgentPassportCardProps) {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const state = getEffectiveState(part.state);
  const cardRef = useRef<HTMLDivElement>(null);
  const [ptr, setPtr] = useState({ x: 50, y: 50, active: false });

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPtr({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
      active: true,
    });
  };

  const handleMouseLeave = () => {
    setPtr({ x: 50, y: 50, active: false });
  };

  if (state === "loading" || state === "approval") {
    return (
      <div className="my-2 overflow-hidden rounded-xl border border-border/60 bg-card p-2.5">
        <div className="flex flex-col items-center justify-center rounded-lg bg-muted/20 p-8">
          <div className="size-5 border-2 border-muted-foreground/30 border-t-muted-foreground/70 rounded-full animate-spin" />
          <p className="mt-3 text-sm text-muted-foreground">
            Building agent...
          </p>
        </div>
      </div>
    );
  }

  if (state === "error" || part.state === "output-denied") {
    return (
      <div className="my-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm text-destructive">
          {part.state === "output-denied"
            ? "Agent creation was cancelled"
            : "Failed to create agent"}
        </p>
      </div>
    );
  }

  const agent = parseAgentFromOutput(part.output);

  if (!agent?.id || !agent?.title) {
    return (
      <div className="my-2 rounded-xl border border-border/60 bg-card p-4">
        <p className="text-sm text-muted-foreground">Agent created</p>
      </div>
    );
  }

  const connectionIds = (agent.connections ?? []).map((c) => c.connection_id);

  const handleSee = () => {
    navigate({
      to: "/$org/agents/$agentId",
      params: { org: org.slug, agentId: agent.id },
      search: {},
    });
  };

  return (
    <div className="my-2 overflow-hidden rounded-xl border-[0.5px] border-border/60 bg-card p-2.5">
      <div
        ref={cardRef}
        className="relative overflow-hidden rounded-lg bg-accent/25 p-2"
        style={{
          transition: "transform 0.3s ease-out",
          transform: ptr.active
            ? `perspective(800px) rotateY(${(ptr.x - 50) * 0.05}deg) rotateX(${(ptr.y - 50) * -0.05}deg)`
            : "none",
          willChange: "transform",
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/*
          Holographic diagonal gradient.
          At rest: subtle, smaller. On hover: fuller, with parallax shift.
          Purple/pink bottom-left, blue/cyan top-right.
        */}
        <div
          className="pointer-events-none absolute inset-[-20%] z-[1] select-none rounded-lg"
          style={{
            background:
              "linear-gradient(135deg, hsla(280, 60%, 80%, 0.35) 0%, transparent 35%), linear-gradient(315deg, hsla(190, 70%, 80%, 0.35) 0%, transparent 35%), linear-gradient(225deg, hsla(140, 55%, 80%, 0.3) 0%, transparent 30%), linear-gradient(45deg, hsla(320, 55%, 82%, 0.3) 0%, transparent 30%)",
            opacity: ptr.active ? 1 : 0.4,
            transform: ptr.active
              ? `translate(${(ptr.x - 50) * 0.15}px, ${(ptr.y - 50) * 0.15}px)`
              : "translate(0, 0)",
            transition: "opacity 0.3s ease, transform 0.3s ease-out",
          }}
          aria-hidden="true"
        />

        {/* Passport certification text overlay */}
        <p
          className="pointer-events-none absolute inset-0 z-[1] select-none overflow-hidden text-[6px] font-light leading-[1.5] tracking-[0.06px] text-background opacity-50 mix-blend-overlay"
          style={{
            textAlign: "justify",
            wordBreak: "break-all",
          }}
          aria-hidden="true"
        >
          {PASSPORT_TEXT.repeat(6)}
        </p>

        {/* Certified agent stamp */}
        <img
          src="/stamp.svg"
          alt=""
          className="pointer-events-none absolute -right-10 -top-10 size-[140px] opacity-50 select-none"
          aria-hidden="true"
        />

        {/* Guilloche patterns — edge to edge, slightly brighter on hover */}
        <img
          src="/left-guilloche.png"
          alt=""
          className="pointer-events-none absolute inset-y-0 left-0 h-full w-auto select-none z-[1] mix-blend-overlay"
          style={{
            opacity: ptr.active ? 0.45 : 0.3,
            transition: "opacity 0.3s ease",
          }}
          aria-hidden="true"
        />
        <img
          src="/right-guilloche.png"
          alt=""
          className="pointer-events-none absolute inset-y-0 right-0 h-full w-auto select-none z-[1] mix-blend-overlay"
          style={{
            opacity: ptr.active ? 0.45 : 0.3,
            transition: "opacity 0.3s ease",
          }}
          aria-hidden="true"
        />

        {/* Content — agent info */}
        <div className="relative">
          <div className="flex items-center gap-2.5 p-2">
            <AgentAvatar icon={agent.icon} name={agent.title} size="md" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-foreground truncate">
                {agent.title}
              </h3>
            </div>
          </div>

          {agent.description && (
            <div className="px-2 pt-1 pr-16">
              <p className="text-sm leading-snug text-muted-foreground line-clamp-2">
                {agent.description}
              </p>
            </div>
          )}
        </div>

        {/* Footer: connections left, actions right */}
        <div className="relative z-[3] flex items-center gap-2.5 px-2 pt-6 pb-1">
          <div className="flex-1 min-w-0">
            {connectionIds.length > 0 && (
              <Suspense
                fallback={<AgentConnectionsPreview.Fallback iconSize="sm" />}
              >
                <AgentConnectionsPreview
                  connectionIds={connectionIds}
                  iconSize="xs"
                  maxVisibleIcons={3}
                  className="flex items-center justify-start -space-x-1"
                />
              </Suspense>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" className="h-7" onClick={handleSee}>
              See agent
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
