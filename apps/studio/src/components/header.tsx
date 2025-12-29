import { Code2, Sparkles } from "lucide-react";

export function Header() {
  return (
    <header className="border-b border-border bg-card">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-primary">
            <Code2 className="h-6 w-6" />
            <span className="font-semibold text-lg">Studio</span>
          </div>
          <span className="text-muted-foreground text-sm hidden sm:inline">
            TypeScript Content Editor
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>AI-Native</span>
        </div>
      </div>
    </header>
  );
}

