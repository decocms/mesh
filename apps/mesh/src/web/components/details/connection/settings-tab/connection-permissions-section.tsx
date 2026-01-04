/**
 * Connection Permissions Section
 *
 * UI for configuring what resources this connection's token can access.
 * Appears in the connection settings for STDIO connections (agents).
 */

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@deco/ui/components/form.tsx";
import { Switch } from "@deco/ui/components/switch.tsx";
import { Key01 } from "@untitledui/icons";
import type { UseFormReturn } from "react-hook-form";
import type { ConnectionFormData } from "./schema";

interface ConnectionPermissionsSectionProps {
  form: UseFormReturn<ConnectionFormData>;
  showForTypes?: ("STDIO" | "NPX")[];
}

/**
 * Check if scopes include full access ("*")
 */
function hasFullAccess(scopes: string[] | null | undefined): boolean {
  return scopes?.includes("*") ?? false;
}

/**
 * Toggle full access in scopes
 */
function toggleFullAccess(
  scopes: string[] | null | undefined,
  enabled: boolean,
): string[] {
  const current = scopes ?? [];

  if (enabled) {
    // Add "*" if not present
    if (!current.includes("*")) {
      return [...current, "*"];
    }
    return current;
  } else {
    // Remove "*"
    return current.filter((s) => s !== "*");
  }
}

export function ConnectionPermissionsSection({
  form,
  showForTypes = ["STDIO", "NPX"],
}: ConnectionPermissionsSectionProps) {
  const uiType = form.watch("ui_type");

  // Only show for specified connection types
  if (!showForTypes.includes(uiType as "STDIO" | "NPX")) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 p-5 border-b border-border">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Key01 className="w-4 h-4 text-muted-foreground" />
        <span>Permissions</span>
      </div>

      <FormField
        control={form.control}
        name="configuration_scopes"
        render={({ field }) => (
          <FormItem className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <FormLabel className="text-sm font-normal">
                Full Tool Access
              </FormLabel>
              <p className="text-xs text-muted-foreground">
                Allow this connection to call tools on any other connection
                (required for agent orchestrators like Pilot)
              </p>
            </div>
            <FormControl>
              <Switch
                checked={hasFullAccess(field.value)}
                onCheckedChange={(checked) => {
                  field.onChange(toggleFullAccess(field.value, checked));
                }}
              />
            </FormControl>
          </FormItem>
        )}
      />
    </div>
  );
}
