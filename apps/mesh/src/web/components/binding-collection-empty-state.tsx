import { authClient } from "@/web/lib/auth-client";
import {
  useConnectionActions,
  useProjectContext,
  type ConnectionCreateData,
} from "@decocms/mesh-sdk";
import { Button } from "@deco/ui/components/button.tsx";
import { EmptyState } from "@/web/components/empty-state";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

interface BindingCollectionEmptyStateProps {
  title: string;
  description: string;
  wellKnownMcp: ConnectionCreateData;
  imageSrc?: string;
  onConnected?: (connectionId: string) => void;
}

export function BindingCollectionEmptyState({
  title,
  description,
  wellKnownMcp,
  imageSrc,
  onConnected,
}: BindingCollectionEmptyStateProps) {
  const actions = useConnectionActions();
  const {
    org: { slug: orgSlug },
  } = useProjectContext();
  const { data: session } = authClient.useSession();
  const navigate = useNavigate();
  const [isInstalling, setIsInstalling] = useState(false);

  const handleInstallMcp = async () => {
    if (!wellKnownMcp || !session?.user?.id) return;

    setIsInstalling(true);
    try {
      const created = await actions.create.mutateAsync(wellKnownMcp);
      onConnected?.(created.id);

      // Navigate to the connection detail page for setup
      navigate({
        to: "/$org/mcps/$connectionId",
        params: { org: orgSlug, connectionId: created.id },
      });
    } finally {
      setIsInstalling(false);
    }
  };

  const handleInstallMcpServer = () => {
    navigate({
      to: "/$org/mcps",
      params: { org: orgSlug },
      search: { action: "create" },
    });
  };

  return (
    <EmptyState
      image={
        imageSrc ? (
          <img
            src={imageSrc}
            alt={title}
            width={336}
            height={320}
            className="max-w-full h-auto"
          />
        ) : null
      }
      title={title}
      description={description}
      actions={
        <>
          <Button
            variant="outline"
            onClick={handleInstallMcp}
            disabled={isInstalling || !wellKnownMcp}
          >
            {wellKnownMcp?.icon && (
              <img src={wellKnownMcp.icon} alt="" className="size-4" />
            )}
            {isInstalling
              ? "Installing..."
              : `Install ${wellKnownMcp?.title || "MCP"}`}
          </Button>
          <Button variant="outline" onClick={handleInstallMcpServer}>
            Custom Connection
          </Button>
        </>
      }
    />
  );
}
