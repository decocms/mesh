import type { MeshContext } from "../core/mesh-context";

// Define Hono variables type
type Variables = {
  meshContext: MeshContext;
};

export type Env = { Variables: Variables };
