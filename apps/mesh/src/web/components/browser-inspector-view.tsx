import { useState } from "react";
import { useInsetContext } from "@/web/layouts/shell-layout";
import { RefreshCcw01, Globe01, LinkExternal01 } from "@untitledui/icons";
import { Button } from "@deco/ui/components/button.tsx";
import { parseFreestyleMetadata } from "@/freestyle/parse-metadata";

export function BrowserInspectorView() {
  const ctx = useInsetContext();
  const [refreshKey, setRefreshKey] = useState(0);

  const fm = parseFreestyleMetadata(ctx?.entity?.metadata);
  const vmDomain = fm.vm_domain;

  if (!vmDomain) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <Globe01 size={32} />
          <p>No running server. Start a script first.</p>
        </div>
      </div>
    );
  }

  const url = `https://${vmDomain}`;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="h-7 w-7 p-0"
        >
          <RefreshCcw01 size={14} />
        </Button>
        <span className="text-xs text-muted-foreground truncate flex-1">
          {url}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
          className="h-7 w-7 p-0"
        >
          <LinkExternal01 size={14} />
        </Button>
      </div>
      <iframe
        key={refreshKey}
        src={url}
        sandbox="allow-scripts allow-forms allow-popups"
        className="flex-1 w-full border-0"
        title="Browser Inspector"
      />
    </div>
  );
}
