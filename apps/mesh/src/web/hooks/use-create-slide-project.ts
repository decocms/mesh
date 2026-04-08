/**
 * Hook to create a full Slide Maker project in one shot:
 * 1. Creates the Slide Maker HTTP connection
 * 2. Creates a "Slide Maker" agent with that connection
 * 3. Creates a project with the agent inside
 * 4. Navigates to the project
 */

import { useConnectionActions, useVirtualMCPActions } from "@decocms/mesh-sdk";
import { useNavigateToAgent } from "@/web/hooks/use-navigate-to-agent";
import { useState } from "react";

const SLIDE_MAKER_URL = "https://slide-maker.decocms.com/api/mcp";
const SLIDE_MAKER_TOKEN = "9c8ed79c-4e23-4ca8-9f22-257afff0aee5";

export function useCreateSlideProject() {
  const connectionActions = useConnectionActions();
  const vmcpActions = useVirtualMCPActions();
  const navigateToAgent = useNavigateToAgent();
  const [isCreating, setIsCreating] = useState(false);

  const create = async () => {
    if (isCreating) return;
    setIsCreating(true);

    try {
      // 1. Create the HTTP connection for Slide Maker
      const connection = await connectionActions.create.mutateAsync({
        title: "Slide Maker",
        description: "Create and edit slide decks",
        connection_type: "HTTP",
        connection_url: SLIDE_MAKER_URL,
        connection_token: SLIDE_MAKER_TOKEN,
        status: "active",
      });

      const connectionId = connection.id;

      // 2. Create the Slide Maker agent (Virtual MCP) with this connection
      const agent = await vmcpActions.create.mutateAsync({
        title: "Slide Maker",
        description: "Creates and edits slide presentations",
        status: "active",
        pinned: false, // Not pinned — lives inside a project
        connections: [
          {
            connection_id: connectionId,
            selected_tools: null,
            selected_resources: null,
            selected_prompts: null,
          },
        ],
      });

      // 3. Create the project with the agent and set default UI to slide_maker tool
      const project = await vmcpActions.create.mutateAsync({
        title: "My Slides",
        description: "Slide decks and presentations",
        status: "active",
        pinned: true,
        connections: [
          {
            connection_id: agent.id!,
            selected_tools: null,
            selected_resources: null,
            selected_prompts: null,
          },
        ],
        metadata: {
          instructions: null,
          type: "project",
          ui: {
            layout: {
              defaultMainView: {
                type: "ext-apps",
                id: connectionId,
                toolName: "slide_maker",
              },
              chatDefaultOpen: true,
            },
          },
        },
      });

      // 4. Navigate to the project
      navigateToAgent(project.id!);
    } finally {
      setIsCreating(false);
    }
  };

  return { create, isCreating };
}
