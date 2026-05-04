import type { MiddlewareHandler } from "hono";
import type { MeshContext } from "../../core/mesh-context";

export const logDeprecatedRoute: MiddlewareHandler<{
  Variables: { meshContext: MeshContext };
}> = async (c, next) => {
  const ctx = c.get("meshContext");
  console.log("deprecated route", {
    route: c.req.routePath,
    method: c.req.method,
    org: ctx?.organization?.slug,
    user: ctx?.auth?.user?.id,
    ua: c.req.header("user-agent"),
  });
  await next();
};
