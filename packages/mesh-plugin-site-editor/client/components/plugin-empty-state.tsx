/**
 * Plugin Empty State Component
 *
 * Shown when no DECO_BLOCKS_BINDING connection is available.
 */

import { LayoutAlt03 } from "@untitledui/icons";

export default function PluginEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <LayoutAlt03 size={48} className="text-muted-foreground mb-4" />
      <h3 className="text-lg font-medium mb-2">No Deco site connected</h3>
      <p className="text-muted-foreground text-center max-w-md">
        This plugin activates when the project connection implements
        DECO_BLOCKS_BINDING (BLOCKS_LIST + LOADERS_LIST tools).
      </p>
    </div>
  );
}
