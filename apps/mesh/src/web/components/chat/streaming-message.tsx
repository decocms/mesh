/**
 * StreamingMessage
 *
 * Mocked streaming text effect: thinking dots → text streams in char by char.
 * Used in onboarding and blog post thread to simulate AI generation.
 * Uses useEffect with lint-disable (same pattern as TypewriterTitle).
 */

import { useState, useEffect } from "react";
import { MemoizedMarkdown } from "./markdown.tsx";

// ─── ThinkingDots ─────────────────────────────────────────────────────────────

export function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-1 px-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

// ─── StreamingMessage ─────────────────────────────────────────────────────────

interface StreamingMessageProps {
  /** Full text to stream in (supports markdown) */
  text: string;
  /** Unique id passed to MemoizedMarkdown */
  id: string;
  /** ms before streaming starts (shows thinking dots during this time) */
  thinkingMs?: number;
  /** ms between each character batch */
  charIntervalMs?: number;
  /** Number of characters added per tick */
  charsPerTick?: number;
  /** Called when the message has finished streaming */
  onDone?: () => void;
}

type Phase = "thinking" | "streaming" | "done";

export function StreamingMessage({
  text,
  id,
  thinkingMs = 700,
  charIntervalMs = 18,
  charsPerTick = 4,
  onDone,
}: StreamingMessageProps) {
  const [phase, setPhase] = useState<Phase>("thinking");
  const [displayed, setDisplayed] = useState("");

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    let cancelled = false;

    const thinkingTimer = setTimeout(() => {
      if (cancelled) return;
      setPhase("streaming");

      let charIndex = 0;
      const interval = setInterval(() => {
        if (cancelled) {
          clearInterval(interval);
          return;
        }
        charIndex = Math.min(charIndex + charsPerTick, text.length);
        setDisplayed(text.slice(0, charIndex));

        if (charIndex >= text.length) {
          clearInterval(interval);
          setPhase("done");
          onDone?.();
        }
      }, charIntervalMs);
    }, thinkingMs);

    return () => {
      cancelled = true;
      clearTimeout(thinkingTimer);
    };
  }, [text, thinkingMs, charIntervalMs, charsPerTick, onDone]);

  if (phase === "thinking") {
    return <ThinkingDots />;
  }

  return (
    <div className="w-full min-w-0 text-[15px] bg-transparent">
      <MemoizedMarkdown id={id} text={displayed} />
      {phase === "streaming" && (
        <span className="inline-block w-0.5 h-[1em] bg-foreground/70 ml-0.5 align-middle animate-pulse" />
      )}
    </div>
  );
}
