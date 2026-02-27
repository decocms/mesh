import type { OBJECT_STORAGE_BINDING, PluginContext } from "@decocms/bindings";

type ToolCaller = PluginContext<typeof OBJECT_STORAGE_BINDING>["toolCaller"];

const PREFIX = "site-research";

function key(sessionId: string, filename: string): string {
  return `${PREFIX}/${sessionId}/${filename}`;
}

/**
 * Write a JSON file to object storage via presigned PUT URL.
 */
export async function writeFile(
  toolCaller: ToolCaller,
  sessionId: string,
  filename: string,
  data: unknown,
): Promise<void> {
  const { url } = await toolCaller("PUT_PRESIGNED_URL", {
    key: key(sessionId, filename),
    contentType: "application/json",
  });
  await fetch(url, {
    method: "PUT",
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Read a JSON file from object storage via presigned GET URL.
 */
export async function readFile<T = unknown>(
  toolCaller: ToolCaller,
  sessionId: string,
  filename: string,
): Promise<T> {
  const { url } = await toolCaller("GET_PRESIGNED_URL", {
    key: key(sessionId, filename),
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to read ${filename}: ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Check whether a file exists in object storage.
 */
export async function fileExists(
  toolCaller: ToolCaller,
  sessionId: string,
  filename: string,
): Promise<boolean> {
  try {
    await toolCaller("GET_OBJECT_METADATA", {
      key: key(sessionId, filename),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * List all research sessions by scanning common prefixes.
 */
export async function listSessions(toolCaller: ToolCaller): Promise<string[]> {
  const result = await toolCaller("LIST_OBJECTS", {
    prefix: `${PREFIX}/`,
    delimiter: "/",
    maxKeys: 1000,
  });
  return (result.commonPrefixes ?? []).map((p: string) =>
    p.replace(`${PREFIX}/`, "").replace(/\/$/, ""),
  );
}
