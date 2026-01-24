/**
 * User Sandbox Connect Page
 *
 * This route redirects to the hackathon deployment for the connect flow.
 */

import { useParams } from "@tanstack/react-router";

export default function ConnectPage() {
  const { sessionId } = useParams({ from: "/connect/$sessionId" });

  if (typeof window !== "undefined") {
    window.location.href = `https://hackathonantigravity.vercel.app/connect/${sessionId}`;
  }

  return null;
}
