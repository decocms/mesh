import { withRuntime } from "@decocms/runtime";
import { createAssetHandler } from "@decocms/runtime/asset-server";

interface Env {
  ASSETS?: {
    fetch: (req: Request) => Promise<Response>;
  };
}

const rootRedirects: Record<string, string> = {
  "/": "/en/introduction",
  "/en": "/en/introduction",
  "/pt-br": "/pt-br/introduction",
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
