import { Button } from "@deco/ui/components/button.tsx";
import { useState } from "react";

interface ResearchStartFormProps {
  onSubmit: (url: string) => void;
  isPending: boolean;
}

function isValidUrl(input: string): boolean {
  try {
    const url = input.startsWith("http") ? input : `https://${input}`;
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function normalizeUrl(input: string): string {
  return input.startsWith("http") ? input : `https://${input}`;
}

export default function ResearchStartForm({
  onSubmit,
  isPending,
}: ResearchStartFormProps) {
  const [url, setUrl] = useState("");
  const valid = url.length > 0 && isValidUrl(url);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (valid && !isPending) {
      onSubmit(normalizeUrl(url));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-3 w-full">
      <div className="flex-1">
        <input
          type="text"
          placeholder="Enter site URL (e.g., example.com)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={isPending}
          className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
      </div>
      <Button type="submit" disabled={!valid || isPending}>
        {isPending ? "Analyzing..." : "Analyze Site"}
      </Button>
    </form>
  );
}
