import { useWidget } from "./use-widget.ts";

type CodeArgs = {
  code?: string;
  language?: string;
};

export default function Code() {
  const { args } = useWidget<CodeArgs>();

  if (!args) return null;

  const { code = "", language = "text" } = args;

  return (
    <div className="rounded-lg overflow-hidden border border-border font-sans">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted border-b border-border">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {language}
        </span>
      </div>
      <pre className="overflow-auto p-3 bg-background">
        <code className="text-xs text-foreground font-mono whitespace-pre">
          {code}
        </code>
      </pre>
    </div>
  );
}
