import { PromptDetailsView } from "@/web/components/details/prompt/index.tsx";
import { ToolDetailsView } from "@/web/components/details/tool.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import {
  useCollectionActions,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { EmptyState } from "@deco/ui/components/empty-state.tsx";
import { Loading01, Container } from "@untitledui/icons";
import { useParams } from "@tanstack/react-router";
import { Suspense, type ComponentType } from "react";
import {
  WorkflowExecutionDetailsView,
  WorkflowDetails,
} from "@/web/components/details/workflow/index.tsx";

interface CollectionDetailsProps {
  itemId: string;
  onUpdate: (updates: Record<string, unknown>) => Promise<void>;
}

// Map of well-known views by collection name
const WELL_KNOWN_VIEW_DETAILS: Record<
  string,
  ComponentType<CollectionDetailsProps>
> = {
  workflow: WorkflowDetails,
  workflow_execution: WorkflowExecutionDetailsView,
  prompt: PromptDetailsView,
};

function ToolDetailsContent() {
  const params = useParams({
    from: "/shell/$org/mcps/$connectionId/$collectionName/$itemId",
  });

  const itemId = decodeURIComponent(params.itemId);

  return <ToolDetailsView itemId={itemId} />;
}

function CollectionDetailsContent() {
  const params = useParams({
    from: "/shell/$org/mcps/$connectionId/$collectionName/$itemId",
  });

  const connectionId = params.connectionId;
  const collectionName = decodeURIComponent(params.collectionName);
  const itemId = decodeURIComponent(params.itemId);

  const scopeKey = connectionId ?? "no-connection";

  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: connectionId ?? null,
    orgId: org.id,
  });

  const actions = useCollectionActions(scopeKey, collectionName, client);

  const handleUpdate = async (updates: Record<string, unknown>) => {
    if (!itemId) return;
    await actions.update.mutateAsync({
      id: itemId,
      data: updates,
    });
    // Success/error toasts are handled by the mutation's onSuccess/onError
  };

  // Check for well-known collections (case insensitive, singular/plural)
  const normalizedCollectionName = collectionName?.toLowerCase();

  const ViewComponent =
    normalizedCollectionName &&
    WELL_KNOWN_VIEW_DETAILS[normalizedCollectionName];

  if (ViewComponent) {
    return <ViewComponent itemId={itemId} onUpdate={handleUpdate} />;
  }

  return (
    <EmptyState
      icon={<Container size={36} className="text-muted-foreground" />}
      title="No component defined"
      description="No component for this collection was defined"
      buttonProps={{
        onClick: () => {
          // Navigation handled by breadcrumb
        },
        children: "Go back",
      }}
    />
  );
}

function CollectionDetailsRouter() {
  const params = useParams({
    from: "/shell/$org/mcps/$connectionId/$collectionName/$itemId",
  });

  const collectionName = decodeURIComponent(params.collectionName);

  const isTools = collectionName === "tools";

  if (isTools) {
    return <ToolDetailsContent />;
  }

  return <CollectionDetailsContent />;
}

export default function CollectionDetails() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Loading01
              size={32}
              className="animate-spin text-muted-foreground"
            />
          </div>
        }
      >
        <CollectionDetailsRouter />
      </Suspense>
    </ErrorBoundary>
  );
}
