/**
 * Hook to create a new gateway (agent).
 * Provides inline gateway creation with optional navigation.
 */

import { useNavigate } from "@tanstack/react-router";
import { useGatewayActions } from "./collections/use-gateway";
import { useProjectContext } from "../providers/project-context-provider";
import type { GatewayEntity } from "@/tools/gateway/schema";

interface CreateGatewayResult {
  id: string;
  gateway: GatewayEntity;
}

interface UseCreateGatewayOptions {
  /** If true, automatically navigate to gateway settings after creation */
  navigateOnCreate?: boolean;
}

interface UseCreateGatewayResult {
  /**
   * Create a new gateway with default values.
   * Returns the new gateway data if successful.
   */
  createGateway: () => Promise<CreateGatewayResult>;
  /**
   * Whether a creation is in progress
   */
  isCreating: boolean;
}

/**
 * Hook that provides inline gateway creation.
 * Use this when you want to create a gateway, optionally navigating to its settings page.
 */
export function useCreateGateway(
  options: UseCreateGatewayOptions = {},
): UseCreateGatewayResult {
  const { navigateOnCreate = false } = options;
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const actions = useGatewayActions();

  const createGateway = async (): Promise<CreateGatewayResult> => {
    const gateway = await actions.create.mutateAsync({
      title: "New Agent",
      description:
        "Agents let you securely expose integrated tools to the outside world.",
      status: "active",
      tool_selection_mode: "inclusion",
      connections: [],
      saved_tools: [],
      saved_resources: [],
      saved_prompts: [],
    });

    if (navigateOnCreate) {
      navigate({
        to: "/$org/gateways/$gatewayId",
        params: { org: org.slug, gatewayId: gateway.id },
      });
    }

    return { id: gateway.id, gateway };
  };

  return {
    createGateway,
    isCreating: actions.create.isPending,
  };
}
