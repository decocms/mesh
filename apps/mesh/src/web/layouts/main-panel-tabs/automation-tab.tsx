import { parseAutomationTabId } from "./tab-id";
import { SettingsTab as AutomationInlineDetail } from "@/web/views/automations/automation-detail";
import { useAutomation } from "@/web/hooks/use-automations";
import { Page } from "@/web/components/page";
import { Loading01 } from "@untitledui/icons";
import { useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { useCapability } from "@/web/hooks/use-capability";
import { NoPermissionState } from "@/web/components/no-permission-state";

export function AutomationTab({
  tabId,
  virtualMcpId,
}: {
  tabId: string;
  virtualMcpId: string;
}) {
  const parsed = parseAutomationTabId(tabId);
  const { granted, loading } = useCapability("automations:manage");

  if (!parsed) return null;
  if (loading) return null;
  if (!granted) {
    return <NoPermissionState area="automations" />;
  }

  return (
    <Page>
      <Page.Content>
        <Page.Body>
          <Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center">
                <Loading01
                  size={20}
                  className="animate-spin text-muted-foreground"
                />
              </div>
            }
          >
            <AutomationTabInner id={parsed.id} virtualMcpId={virtualMcpId} />
          </Suspense>
        </Page.Body>
      </Page.Content>
    </Page>
  );
}

function AutomationTabInner({
  id,
  virtualMcpId,
}: {
  id: string;
  virtualMcpId: string;
}) {
  const navigate = useNavigate();
  const { data: automation, isLoading } = useAutomation(id);

  const onBack = () =>
    navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        main: "automations",
      }),
      replace: true,
    });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loading01 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!automation) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Automation not found
      </div>
    );
  }

  return (
    <AutomationInlineDetail
      automationId={id}
      automation={automation}
      virtualMcpId={virtualMcpId}
      onBack={onBack}
    />
  );
}
