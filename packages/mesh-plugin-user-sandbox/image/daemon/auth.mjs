import { TOKEN } from "./config.mjs";

/** Bearer-token check. Health is exempt upstream; every other route goes through this. */
export function authorized(req) {
  return (req.headers["authorization"] ?? "") === `Bearer ${TOKEN}`;
}
