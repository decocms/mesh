/**
 * Chat Context — consumer hooks from merged provider architecture.
 *
 * Use the specific hooks for fine-grained subscriptions:
 *   useChatStream() — messages, status, streaming state
 *   useChatTask() — tasks, navigation, virtualMcpId
 *   useChatPrefs() — model selection, app contexts, tiptap
 *   useChatBridge() — DEPRECATED, use useChatStream
 */

export {
  ChatProvider,
  useChatTask,
  useChatStream,
  useOptionalChatStream,
  useChatPrefs,
  useOptionalChatPrefs,
  useChatBridge,
  type ChatStreamContextValue,
  type ChatTaskContextValue,
  type ChatPrefsContextValue,
  type ChatBridgeValue,
} from "./chat-context";
