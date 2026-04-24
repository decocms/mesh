export async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

/**
 * Use in JSON handlers — readJson on a stream drained by the threadId guard
 * would return {}. IncomingMessage only yields its data once.
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
