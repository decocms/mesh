/**
 * PermissionTooltip
 *
 * Wraps an action (button, menu item, etc.) so that when the user lacks the
 * required capability the trigger is disabled and explains why on hover.
 *
 * Usage:
 *   <PermissionGate capability="connections:manage">
 *     {({ disabled, tooltip }) => (
 *       <Button disabled={disabled} onClick={...}>Delete</Button>
 *     )}
 *   </PermissionGate>
 *
 * Or for direct wrapping:
 *   <PermissionTooltip capability="connections:manage">
 *     <Button onClick={...}>Delete</Button>
 *   </PermissionTooltip>
 */

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { cloneElement, isValidElement, type ReactElement } from "react";
import {
  NO_PERMISSION_TOOLTIP,
  useCapability,
  type CapabilityId,
} from "@/web/hooks/use-capability";

interface PermissionTooltipProps {
  capability: CapabilityId;
  children: ReactElement<{ disabled?: boolean; "aria-disabled"?: boolean }>;
  message?: string;
  /**
   * Show tooltip even when allowed (useful when wrapping in a list to keep
   * markup stable). Defaults to false — no tooltip shown if user has access.
   */
  alwaysWrap?: boolean;
}

/**
 * Wraps a single interactive element. When the user lacks the capability the
 * child is forcibly disabled and a tooltip explains why.
 */
export function PermissionTooltip({
  capability,
  children,
  message = NO_PERMISSION_TOOLTIP,
  alwaysWrap = false,
}: PermissionTooltipProps) {
  const { granted, loading } = useCapability(capability);

  if (granted || loading) {
    if (!alwaysWrap) return children;
    return children;
  }

  if (!isValidElement(children)) return children;

  const disabled = cloneElement(children, {
    disabled: true,
    "aria-disabled": true,
  });

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{disabled}</span>
        </TooltipTrigger>
        <TooltipContent>{message}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface PermissionGateProps {
  capability: CapabilityId;
  children: (state: {
    granted: boolean;
    loading: boolean;
    disabled: boolean;
    tooltip: string;
  }) => ReactElement | null;
}

/**
 * Render-prop variant. Use when the disabled state needs to flow into a more
 * complex JSX tree than wrapping a single element.
 */
export function PermissionGate({ capability, children }: PermissionGateProps) {
  const { granted, loading } = useCapability(capability);
  return children({
    granted,
    loading,
    disabled: !granted && !loading,
    tooltip: NO_PERMISSION_TOOLTIP,
  });
}
