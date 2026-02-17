/**
 * Page Editor Component
 *
 * Route component for /pages/$pageId.
 * Renders the visual PageComposer for block editing with live preview.
 */

import { siteEditorRouter } from "../lib/router";
import PageComposer from "./page-composer";

export default function PageEditor() {
  // Validate route params are available
  siteEditorRouter.useParams({ from: "/site-editor-layout/pages/$pageId" });

  return <PageComposer />;
}
