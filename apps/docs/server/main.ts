import { withRuntime } from "@decocms/runtime";
import { createAssetHandler } from "@decocms/runtime/asset-server";

interface Env {
  ASSETS?: {
    fetch: (req: Request) => Promise<Response>;
  };
}

const rootRedirects: Record<string, string> = {
  "/": "/latest/en/mcp-mesh/quickstart",
  "/latest": "/latest/en/mcp-mesh/quickstart",
  "/draft": "/draft/en/mcp-mesh/quickstart",
  "/en": "/latest/en/mcp-mesh/quickstart",
  "/pt-br": "/latest/pt-br/mcp-mesh/quickstart",
  "/latest/en": "/latest/en/mcp-mesh/quickstart",
  "/latest/pt-br": "/latest/pt-br/mcp-mesh/quickstart",
  "/draft/en": "/draft/en/mcp-mesh/quickstart",
  "/draft/pt-br": "/draft/pt-br/mcp-mesh/quickstart",
};

const runtime = withRuntime<Env>({
  fetch: async (req, env) => {
    const url = new URL(req.url);
    if (rootRedirects[url.pathname]) {
      return Response.redirect(
        new URL(rootRedirects[url.pathname], req.url),
        302,
      );
    }

    const assetsHandler =
      env.ASSETS?.fetch ??
      createAssetHandler({
        env: "development",
      });

    return (
      (await assetsHandler(req)) ?? new Response("Not found", { status: 404 })
    );
  },
});

export default runtime;
