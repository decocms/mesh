/**
 * Tiny HTTP helpers shared across route handlers. Kept as a standalone module
 * so the concerns they serve (request body parsing, JSON/text responses)
 * don't bleed into feature modules.
 */

export async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

/**
 * Prefer the body already parsed by the top-level threadId guard in daemon.mjs;
 * Node's IncomingMessage only yields its data once, so calling readJson again
 * on a drained stream returns {} and the route handler sees every field as
 * undefined. All JSON route handlers should use this instead of readJson.
 */
export async function parsedBody(req) {
  if (req._parsedBody !== undefined) return req._parsedBody;
  return (await readJson(req).catch(() => ({}))) ?? {};
}

export function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export function sendText(
  res,
  status,
  body,
  contentType = "text/plain; charset=utf-8",
) {
  res.writeHead(status, { "content-type": contentType });
  res.end(body);
}
