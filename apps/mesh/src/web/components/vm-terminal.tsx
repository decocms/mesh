import { useRef, useEffect } from "react";
import { cn } from "@deco/ui/lib/utils.ts";
import Convert from "ansi-to-html";

const MAX_LINES = 100;

const ansiConverter = new Convert({ escapeXML: true });

interface VmTerminalProps {
  lines: string[];
  className?: string;
}

export function VmTerminal({ lines, className }: VmTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  const visibleLines =
    lines.length > MAX_LINES ? lines.slice(-MAX_LINES) : lines;

  // oxlint-disable-next-line ban-use-effect/ban-use-effect — scroll-to-bottom requires DOM measurement after render; no React 19 alternative
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !shouldAutoScroll.current) return;
    el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    // Auto-scroll if user is near the bottom (within 50px)
    shouldAutoScroll.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={cn(
        "overflow-y-auto bg-background font-mono text-xs leading-5 p-3",
        className,
      )}
    >
      {visibleLines.length === 0 ? (
        <span className="text-muted-foreground">Waiting for output...</span>
      ) : (
        visibleLines.map((line, i) => (
          <div
            key={i}
            className="whitespace-pre-wrap break-all text-foreground"
            dangerouslySetInnerHTML={{
              __html: ansiConverter.toHtml(line),
            }}
          />
        ))
      )}
    </div>
  );
}
