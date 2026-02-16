/**
 * Hypercouple Plugin Empty State
 *
 * Shown when no connection is configured.
 * Friendly welcome message for first-time visitors.
 */

import { Heart } from "lucide-react";

export default function PluginEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <Heart size={48} className="text-rose-300 mb-4" />
      <h3 className="text-lg font-medium mb-2">Welcome to Hypercouple</h3>
      <p className="text-muted-foreground text-center max-w-md">
        Your AI-powered couple's workspace. Plan adventures, stay in sync, and
        let your AI team handle the details -- together.
      </p>
    </div>
  );
}
