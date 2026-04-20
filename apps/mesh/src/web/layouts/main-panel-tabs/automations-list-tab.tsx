import { Suspense } from "react";
import { Loading01 } from "@untitledui/icons";
import { AutomationsList } from "@/web/views/automations/automations-list";

export function AutomationsListTab({ virtualMcpId }: { virtualMcpId: string }) {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center">
          <Loading01 size={20} className="animate-spin text-muted-foreground" />
        </div>
      }
    >
      <AutomationsList virtualMcpId={virtualMcpId} />
    </Suspense>
  );
}
