import { Suspense } from "react";
import { Loading01 } from "@untitledui/icons";
import { AutomationsList } from "@/web/views/automations/automations-list";
import { useCapability } from "@/web/hooks/use-capability";
import { NoPermissionState } from "@/web/components/no-permission-state";

export function AutomationsListTab({ virtualMcpId }: { virtualMcpId: string }) {
  const { granted, loading } = useCapability("automations:manage");

  if (loading) return null;
  if (!granted) {
    return <NoPermissionState area="automations" />;
  }

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
