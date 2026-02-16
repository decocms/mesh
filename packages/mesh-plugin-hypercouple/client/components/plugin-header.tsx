/**
 * Hypercouple Plugin Header
 *
 * Branded header for the couple's workspace.
 * Warm, calm design with couple-themed styling.
 */

import type { PluginRenderHeaderProps } from "@decocms/bindings/plugins";
import { Heart } from "lucide-react";

export default function PluginHeader(_props: PluginRenderHeaderProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Heart size={16} className="text-rose-400" />
      <span className="font-medium text-foreground">Hypercouple</span>
    </div>
  );
}
