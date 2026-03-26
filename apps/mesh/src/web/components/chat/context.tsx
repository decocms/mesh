/**
 * Chat Context — consumer hooks composing from 3 internal contexts.
 *
 * useChat() provides the full combined interface.
 * useChatStable() is deprecated — identical to useChat().
 *
 * For fine-grained subscriptions (avoid unnecessary re-renders), use:
 *   useChatStream() — messages, status, streaming state
 *   useChatTask() — tasks, navigation, virtualMcpId
 *   useChatPrefs() — model selection, app contexts, tiptap
 */

export {
  ChatContextProvider,
  useChatContext as useChat,
  useChatTask,
  type ChatContextValue,
  type ChatStreamContextValue,
  type ChatTaskContextValue,
  type ChatPrefsContextValue,
} from "./chat-context";

/**
 * @deprecated Use useChat() instead. This is an identical re-export.
 */
export { useChatContext as useChatStable } from "./chat-context";
