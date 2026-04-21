import { useRef, useEffect } from "react";
import { cn } from "@decocms/ui/lib/utils.ts";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface VmTerminalProps {
  onReady?: (terminal: Terminal) => void;
  onSelectionChange?: (hasSelection: boolean, getText: () => string) => void;
  initialData?: string;
  className?: string;
}

export function VmTerminal({
  onReady,
  onSelectionChange,
  initialData,
  className,
}: VmTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  // oxlint-disable-next-line ban-use-effect/ban-use-effect — xterm.js lifecycle: create on mount, dispose on unmount
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const style = getComputedStyle(document.documentElement);
    const cssVar = (name: string) =>
      style.getPropertyValue(name).trim() || undefined;

    const terminal = new Terminal({
      allowTransparency: false,
      fontFamily:
        cssVar("--font-mono") ||
        "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.4,
      scrollback: 5000,
      cursorBlink: false,
      disableStdin: true,
      theme: {
        background: cssVar("--background") || "#1e1e1e",
        cursor: "transparent",
        foreground: cssVar("--foreground") || "#d4d4d4",
        selectionBackground: cssVar("--accent"),
        selectionForeground: cssVar("--accent-foreground"),

        black: cssVar("--muted"),
        red: cssVar("--destructive"),
        green: cssVar("--success"),
        yellow: cssVar("--warning"),
        blue: cssVar("--chart-1"),
        magenta: cssVar("--chart-3"),
        cyan: cssVar("--chart-5"),
        white: cssVar("--foreground"),

        brightBlack: cssVar("--muted-foreground"),
        brightRed: cssVar("--destructive"),
        brightGreen: cssVar("--success"),
        brightYellow: cssVar("--warning"),
        brightBlue: cssVar("--chart-1"),
        brightMagenta: cssVar("--chart-3"),
        brightCyan: cssVar("--chart-5"),
        brightWhite: cssVar("--foreground"),
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(el);
    fitAddon.fit();
    if (initialData) {
      terminal.write(initialData);
    }
    terminalRef.current = terminal;
    onReady?.(terminal);

    const selectionDisposable = terminal.onSelectionChange(() => {
      const has = !!terminal.getSelection();
      onSelectionChangeRef.current?.(has, () => terminal.getSelection());
    });

    const observer = new ResizeObserver(() => {
      fitAddon.fit();
    });
    observer.observe(el);

    return () => {
      selectionDisposable.dispose();
      observer.disconnect();
      terminalRef.current = null;
      terminal.dispose();
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps — mount-only: initialData and onReady are consumed once during terminal setup
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn("overflow-hidden bg-background p-3", className)}
    />
  );
}
