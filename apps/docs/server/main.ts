import { withRuntime } from "@decocms/runtime";
import { createAssetHandler } from "@decocms/runtime/asset-server";

interface Env {
  ASSETS?: {
    fetch: (req: Request) => Promise<Response>;
  };
}

const runtime = withRuntime<Env>({
  fetch: async (req, env) => {
    const url = new URL(req.url);
    if (url.pathname === "/" || url.pathname === "") {
      return Response.redirect(new URL("/en/introduction", req.url), 302);
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
