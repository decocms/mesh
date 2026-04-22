/**
 * Tiny HTTP helpers shared across route handlers. Kept as a standalone module
 * so the concerns they serve (request body parsing, JSON/text responses, first-
 * line peek) don't bleed into feature modules.
 */

export async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
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

/**
 * Buffer bytes from an IncomingMessage until the first LF. Resolves with the
 * line (without the LF) plus any bytes that came after it on the same chunk,
 * so the caller can pipe the rest of the body onward. On EOF without an LF,
 * resolves with the whole buffer as `line` and null `rest`.
 *
 * Uses on('data') rather than `for await`: async iteration calls
 * iterator.return() when we break out of the loop, which destroys the stream.
 * The stream must stay alive so callers can pipe remaining bytes to a child's
 * stdin.
 */
function readFirstLine(req) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const cleanup = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
    };
    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const idx = buffer.indexOf(0x0a);
      if (idx === -1) return;
      cleanup();
      req.pause();
      resolve({
        line: buffer.subarray(0, idx).toString("utf8"),
        rest: idx + 1 < buffer.length ? buffer.subarray(idx + 1) : null,
      });
    };
    const onEnd = () => {
      cleanup();
      resolve({ line: buffer.toString("utf8"), rest: null });
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
  });
}
