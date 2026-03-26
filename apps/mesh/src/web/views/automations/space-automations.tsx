import { AutomationsTabContent } from "./automations-tab";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { Page } from "@/web/components/page";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@deco/ui/components/breadcrumb.tsx";
import { Loading01 } from "@untitledui/icons";
import { useMatch, useSearch } from "@tanstack/react-router";
import { Suspense } from "react";

function SpaceAutomationsContent() {
  const spacesMatch = useMatch({
    from: "/shell/$org/spaces/$virtualMcpId/automations",
    shouldThrow: false,
  });
  const virtualMcpId = spacesMatch?.params.virtualMcpId ?? "";
  const search = useSearch({ strict: false }) as {
    automationId?: string;
  };
  return (
    <Page>
      <Page.Header>
        <Page.Header.Left>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Automations</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Page.Header.Left>
      </Page.Header>
      <Page.Content>
        <AutomationsTabContent
          virtualMcpId={virtualMcpId}
          selectedAutomationId={search.automationId}
        />
      </Page.Content>
    </Page>
  );
}

export default function SpaceAutomationsPage() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center bg-background">
            <Loading01
              size={32}
              className="animate-spin text-muted-foreground"
            />
          </div>
        }
      >
        <SpaceAutomationsContent />
      </Suspense>
    </ErrorBoundary>
  );
}
