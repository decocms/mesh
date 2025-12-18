import type { ConnectionCreateData } from "@/tools/connection/schema";
import { ConnectionCard } from "@/web/components/connections/connection-card.tsx";
import { useConnectionActions } from "@/web/hooks/collections/use-connection";
import { authClient } from "@/web/lib/auth-client";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Button } from "@deco/ui/components/button.tsx";
import { EmptyState } from "@/web/components/empty-state";
import { Icon } from "@deco/ui/components/icon.tsx";

interface StoreRegistryEmptyStateProps {
  registries: ConnectionCreateData[];
  onConnected?: (createdRegistryId: string) => void;
}

export function StoreRegistryEmptyState({
  registries,
  onConnected,
}: StoreRegistryEmptyStateProps) {
  return (
    <EmptyState
      image={
        <img
          src="/store-empty-state.svg"
          alt="No store connected"
          width={423}
          height={279}
          className="max-w-full h-auto"
        />
      }
      title="Connect to a store"
      description="Choose a registry to discover and connect MCPs from the community."
      descriptionClassName="max-w-[500px]"
      actionsClassName="w-full max-w-2xl"
      actions={
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
          {registries.map((registry, index) => {
            const registryId = registry.id ?? `registry-${index}`;

            return (
              <RegistryConnectCard
                key={registryId}
                registry={{ ...registry, id: registryId }}
                onConnected={onConnected}
              />
            );
          })}
        </div>
      }
    />
  );
}

function RegistryConnectCard({
  registry,
  onConnected,
}: {
  registry: ConnectionCreateData;
  onConnected?: (createdRegistryId: string) => void;
}) {
  const actions = useConnectionActions();
  const { org } = useProjectContext();
  const { data: session } = authClient.useSession();

  const canConnect = !!org && !!session?.user?.id;

  const handleConnect = async () => {
    if (!canConnect) return;
    const created = await actions.create.mutateAsync(registry);
    onConnected?.(created.id);
  };

  return (
    <ConnectionCard
      connection={registry}
      onClick={handleConnect}
      footer={
        <Button
          variant="outline"
          className="w-full"
          disabled={!canConnect || actions.create.isPending}
          onClick={handleConnect}
        >
          {actions.create.isPending ? (
            <>
              <Icon name="progress_activity" className="animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Icon name="add" />
              Connect
            </>
          )}
        </Button>
      }
      className="transition-all hover:border-primary/50 hover:shadow-md"
    />
  );
}
