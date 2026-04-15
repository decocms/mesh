import type { ChatMode } from "@/api/routes/decopilot/mode-config";

/**
 * Ref updated every render so the transport can read the current chat mode
 * without React state access. Not used for sends — the mode is passed through
 * message metadata instead (see sendMessageInternal in chat-context.tsx).
 */
export const chatModeForTransportRef = { current: "default" as ChatMode };
