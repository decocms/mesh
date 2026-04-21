/**
 * ChatCenterPanel — center-panel entry point for the unified chat layout.
 *
 * Thin wrapper around the existing `ChatPanel` implementation. `variant="home"`
 * is handed to the panel for the decopilot (org-home) case; otherwise the
 * default sidebar empty state is used. The three-panel shell in
 * `agent-shell-layout` wires the appropriate variant.
 */
export { ChatPanel as ChatCenterPanel } from "@/web/components/chat/side-panel-chat";
