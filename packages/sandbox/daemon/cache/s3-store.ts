import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

export interface S3Store {
  head(key: string): Promise<boolean>;
  get(key: string): Promise<Buffer>;
  put(key: string, data: Buffer, opts?: { ifNoneMatch?: "*" }): Promise<void>;
}

export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

interface Creds {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiry?: Date;
}

function hmacSha256(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function signingKey(secret: string, date: string, region: string): Buffer {
  return hmacSha256(
    hmacSha256(hmacSha256(hmacSha256("AWS4" + secret, date), region), "s3"),
    "aws4_request",
  );
}

function utcTimestamp(): { date: string; datetime: string } {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
  return {
    date,
    datetime: `${date}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`,
  };
}

// RFC 3986 unreserved chars + keep /
function encodePath(s: string): string {
  return s.replace(
    /[^A-Za-z0-9\-._~\/]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );
}

// RFC 3986 unreserved chars only (for query param key/value)
function encodeParam(s: string): string {
  return s.replace(
    /[^A-Za-z0-9\-._~]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );
}

function buildAuthHeaders(
  method: string,
  url: URL,
  payload: Buffer,
  region: string,
  creds: Creds,
  extra: Record<string, string> = {},
): Record<string, string> {
  const { date, datetime } = utcTimestamp();
  const payloadHash = sha256hex(payload);

  const hdrs: Record<string, string> = {
    host: url.host,
    "x-amz-date": datetime,
    "x-amz-content-sha256": payloadHash,
    ...extra,
  };
  if (creds.sessionToken) hdrs["x-amz-security-token"] = creds.sessionToken;

  const sortedKeys = Object.keys(hdrs).sort();
  const canonHeaders = sortedKeys.map((k) => `${k}:${hdrs[k]}\n`).join("");
  const signedHeadersList = sortedKeys.join(";");

  const qs = [...url.searchParams.entries()]
    .map(([k, v]) => `${encodeParam(k)}=${encodeParam(v)}`)
    .sort()
    .join("&");

  const canonReq = [
    method,
    encodePath(url.pathname),
    qs,
    canonHeaders,
    signedHeadersList,
    payloadHash,
  ].join("\n");

  const scope = `${date}/${region}/s3/aws4_request`;
  const sts = ["AWS4-HMAC-SHA256", datetime, scope, sha256hex(canonReq)].join(
    "\n",
  );
  const sig = createHmac(
    "sha256",
    signingKey(creds.secretAccessKey, date, region),
  )
    .update(sts, "utf8")
    .digest("hex");

  hdrs["authorization"] =
    `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${signedHeadersList}, Signature=${sig}`;

  return hdrs;
}

function xmlTag(xml: string, tag: string): string {
  return xml.match(new RegExp(`<${tag}>([^<]*)<\/${tag}>`))?.[1] ?? "";
}

async function fetchIrsaCreds(region: string): Promise<Creds> {
  const tokenFile = process.env.AWS_WEB_IDENTITY_TOKEN_FILE;
  const roleArn = process.env.AWS_ROLE_ARN;
  if (!tokenFile || !roleArn) throw new Error("IRSA env vars missing");

  const token = readFileSync(tokenFile, "utf8").trim();
  const regional = process.env.AWS_STS_REGIONAL_ENDPOINTS === "regional";
  const stsHost = regional
    ? `sts.${region}.amazonaws.com`
    : "sts.amazonaws.com";

  const body = new URLSearchParams({
    Action: "AssumeRoleWithWebIdentity",
    Version: "2011-06-15",
    RoleArn: roleArn,
    RoleSessionName: "sandbox-s3-cache",
    WebIdentityToken: token,
  }).toString();

  const res = await fetch(`https://${stsHost}/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const xml = await res.text();
  if (!res.ok) throw new Error(`STS ${res.status}: ${xml.slice(0, 200)}`);

  return {
    accessKeyId: xmlTag(xml, "AccessKeyId"),
    secretAccessKey: xmlTag(xml, "SecretAccessKey"),
    sessionToken: xmlTag(xml, "SessionToken") || undefined,
    expiry: new Date(xmlTag(xml, "Expiration")),
  };
}

function makeCredsFetcher(cfg: S3Config): () => Promise<Creds> {
  if (cfg.accessKeyId && cfg.secretAccessKey) {
    const c: Creds = {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    };
    return () => Promise.resolve(c);
  }
  let cached: Creds | null = null;
  return async () => {
    if (
      !cached ||
      (cached.expiry && cached.expiry.getTime() - Date.now() < 5 * 60_000)
    ) {
      cached = await fetchIrsaCreds(cfg.region);
    }
    return cached;
  };
}

export function createS3Store(cfg: S3Config): S3Store {
  const { bucket, region, endpoint } = cfg;
  const getCreds = makeCredsFetcher(cfg);

  function objectUrl(key: string): URL {
    if (endpoint) {
      return new URL(`${endpoint.replace(/\/$/, "")}/${bucket}/${key}`);
    }
    return new URL(`https://${bucket}.s3.${region}.amazonaws.com/${key}`);
  }

  async function doRequest(
    method: string,
    key: string,
    payload: Buffer = Buffer.alloc(0),
    extra: Record<string, string> = {},
  ): Promise<Response> {
    const url = objectUrl(key);
    const creds = await getCreds();
    const headers = buildAuthHeaders(
      method,
      url,
      payload,
      region,
      creds,
      extra,
    );
    let body: ArrayBuffer | undefined;
    if (payload.length > 0 && method !== "HEAD" && method !== "GET") {
      body = new ArrayBuffer(payload.length);
      new Uint8Array(body).set(payload);
    }
    return fetch(url.toString(), { method, headers, body });
  }

  return {
    async head(key) {
      try {
        return (await doRequest("HEAD", key)).status === 200;
      } catch {
        return false;
      }
    },

    async get(key) {
      const res = await doRequest("GET", key);
      if (!res.ok) throw new Error(`S3 GET ${key}: ${res.status}`);
      return Buffer.from(new Uint8Array(await res.arrayBuffer()));
    },

    async put(key, data, opts) {
      const extra: Record<string, string> = {};
      if (opts?.ifNoneMatch) extra["if-none-match"] = opts.ifNoneMatch;
      try {
        const res = await doRequest("PUT", key, data, extra);
        await res.text().catch(() => {});
      } catch {
        // non-fatal
      }
    },
  };
}
