import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@deco/ui/components/button.tsx";
import { EmptyState } from "../empty-state";
import {
  useConnectionActions,
  useConnections,
} from "@/web/hooks/collections/use-connection";
import {
  getWellKnownOpenRouterConnection,
  OPENROUTER_ICON_URL,
  OPENROUTER_MCP_URL,
} from "@/core/well-known-mcp";
import { generatePrefixedId } from "@/shared/utils/generate-id";
import { useChat } from "./context";

interface NoLlmBindingEmptyStateProps {
  title?: string;
  description?: string;
  org: { slug: string; id: string };
}

/**
 * Empty state component shown when no LLM binding is available.
 * Includes OpenRouter installation logic and UI.
 * Uses chat context for user info and fetches connections internally.
 */
export function NoLlmBindingEmptyState({
  title = "No model provider connected",
  description = "Connect to a model provider to unlock AI-powered features.",
  org,
}: NoLlmBindingEmptyStateProps) {
  const [isInstalling, setIsInstalling] = useState(false);
  const connectionActions = useConnectionActions();
  const navigate = useNavigate();
  const { user } = useChat();
  const allConnections = useConnections();

  const userId = user?.id ?? "";

  const handleInstallMcpServer = () => {
    navigate({
      to: "/$org/mcps",
      params: { org: org.slug },
      search: { action: "create" },
    });
  };

  const handleInstallOpenRouter = async () => {
    if (!org.id || !userId) {
      toast.error("Not authenticated");
      return;
    }

    setIsInstalling(true);
    try {
      // Check if OpenRouter already exists
      const existingConnection = allConnections?.find(
        (conn) => conn.connection_url === OPENROUTER_MCP_URL,
      );

      if (existingConnection) {
        navigate({
          to: "/$org/mcps/$connectionId",
          params: { org: org.slug, connectionId: existingConnection.id },
        });
        return;
      }

      // Create new OpenRouter connection
      const connectionData = getWellKnownOpenRouterConnection({
        id: generatePrefixedId("conn"),
      });

      const result = await connectionActions.create.mutateAsync(connectionData);

      navigate({
        to: "/$org/mcps/$connectionId",
        params: { org: org.slug, connectionId: result.id },
      });
    } catch (error) {
      toast.error(
        `Failed to connect OpenRouter: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <EmptyState
      image={
        <img
          src="/empty-state-openrouter.svg"
          alt=""
          width={336}
          height={320}
          aria-hidden="true"
          className="w-xs h-auto mask-radial-[100%_100%] mask-radial-from-20% mask-radial-to-50% mask-radial-at-center"
        />
      }
      title={title}
      description={description}
      actions={
        <>
          <Button
            variant="outline"
            onClick={handleInstallOpenRouter}
            disabled={isInstalling}
          >
            <img
              src={OPENROUTER_ICON_URL}
              alt="OpenRouter"
              className="size-4"
            />
            {isInstalling ? "Installing..." : "Install OpenRouter"}
          </Button>
          <Button variant="outline" onClick={handleInstallMcpServer}>
            Install Connection
          </Button>
        </>
      }
    />
  );
}
