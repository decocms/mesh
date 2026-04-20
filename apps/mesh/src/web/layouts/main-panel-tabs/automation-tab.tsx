import { parseAutomationTabId } from "./tab-id";
import { SettingsTab as AutomationInlineDetail } from "@/web/views/automations/automation-detail";
import { useAutomationDetail } from "@/web/hooks/use-automations";
import { Loading01 } from "@untitledui/icons";
import { useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";

export function AutomationTab({ tabId }: { tabId: string }) {
  const parsed = parseAutomationTabId(tabId);
  if (!parsed) return null;

  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center">
          <Loading01 size={20} className="animate-spin text-muted-foreground" />
        </div>
      }
    >
      <AutomationTabInner parsed={parsed} />
    </Suspense>
  );
}

function AutomationTabInner({
  parsed,
}: {
  parsed: { kind: "new" } | { kind: "existing"; id: string };
}) {
  const navigate = useNavigate();
  const onBack = () =>
    navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        main: "automations",
      }),
      replace: true,
    });

  if (parsed.kind === "new") {
    return (
      <AutomationInlineDetail
        automationId="new"
        automation={null}
        onBack={onBack}
      />
    );
  }
  return <ExistingAutomation id={parsed.id} onBack={onBack} />;
}

function ExistingAutomation({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
  const { data: automation } = useAutomationDetail(id);
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
      onBack={onBack}
    />
  );
}
