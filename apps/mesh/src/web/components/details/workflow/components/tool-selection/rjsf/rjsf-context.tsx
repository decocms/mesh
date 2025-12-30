import { createContext, useContext } from "react";
import type { MentionItem } from "@/web/components/tiptap-mentions-input";

export const MentionsContext = createContext<MentionItem[]>([]);

export function useMentions() {
  return useContext(MentionsContext);
}
