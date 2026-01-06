/**
 * Organization Home Page
 *
 * Full-page chat interface that starts with a centered greeting and input.
 * When a message is sent, transitions to normal chat with input at the bottom.
 */

import { ChatProvider } from "../../../components/chat/chat-context";
import { DecopilotChat } from "../../../components/decopilot-chat";

export default function OrgHomePage() {
  return (
    <ChatProvider>
      <DecopilotChat />
    </ChatProvider>
  );
}
