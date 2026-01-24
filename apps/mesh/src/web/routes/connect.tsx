/**
 * User Sandbox Connect Page
 *
 * This route renders the user-sandbox plugin's ConnectFlow component.
 * It's a public page for end users to configure integrations.
 *
 *
 * TODO: Currently, plugins cannot register their own root-level client-side routes.
 * This route exists here because the React Router tree lives in the main app.
 * In the future, the plugin system should support root-level client-side route registration
 * so this file can be removed and the route defined in the plugin itself.
 *
 * @see packages/mesh-plugin-user-sandbox/client/components/connect-flow.tsx
 */

import { useParams } from "@tanstack/react-router";
import { ConnectFlow } from "mesh-plugin-user-sandbox/client";

export default function ConnectPage() {
  const { sessionId } = useParams({ from: "/connect/$sessionId" });

  return <ConnectFlow sessionId={sessionId} />;
}
