import { Box, Text } from "ink";
import type { Settings } from "../settings";

const SECRET_KEYS = new Set([
  "betterAuthSecret",
  "encryptionKey",
  "meshJwtSecret",
]);

const URL_KEYS = new Set(["databaseUrl", "clickhouseUrl", "natsUrls"]);

function redactUrl(url: string | undefined): string {
  if (!url) return "not set";
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    if (parsed.username && parsed.username.length > 3)
      parsed.username = parsed.username.slice(0, 3) + "***";
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    if (url.length <= 10) return url;
    return url.slice(0, 6) + "***" + url.slice(-4);
  }
}

function formatValue(
  key: string,
  raw: unknown,
): { text: string; color?: string; dimColor?: boolean } {
  if (SECRET_KEYS.has(key)) {
    return raw
      ? { text: "\u25cf\u25cf\u25cf\u25cf\u25cf\u25cf", dimColor: true }
      : { text: "not set", dimColor: true };
  }
  if (URL_KEYS.has(key)) {
    if (Array.isArray(raw)) {
      if (raw.length === 0) return { text: "not set", dimColor: true };
      const redacted = raw.map((u) => redactUrl(u as string)).join(", ");
      return { text: redacted, color: "cyan" };
    }
    const redacted = redactUrl(raw as string | undefined);
    return redacted === "not set"
      ? { text: redacted, dimColor: true }
      : { text: redacted, color: "cyan" };
  }
  if (raw === undefined || raw === null || raw === "")
    return { text: "not set", dimColor: true };
  const str = String(raw);
  if (str === "true") return { text: str, color: "green" };
  if (str === "false") return { text: str, color: "yellow" };
  try {
    new URL(str);
    return { text: str, color: "cyan" };
  } catch {
    return { text: str };
  }
}

interface ConfigSection {
  title: string;
  entries: { key: string; value: unknown }[];
}

function getConfigSections(e: Settings): ConfigSection[] {
  return [
    {
      title: "Core",
      entries: [
        { key: "nodeEnv", value: e.nodeEnv },
        { key: "port", value: e.port },
        { key: "baseUrl", value: e.baseUrl ?? `http://localhost:${e.port}` },
        { key: "dataDir", value: e.dataDir },
      ],
    },
    {
      title: "Database",
      entries: [
        { key: "databaseUrl", value: e.databaseUrl },
        { key: "databasePgSsl", value: e.databasePgSsl },
      ],
    },
    {
      title: "Auth & Secrets",
      entries: [
        { key: "betterAuthSecret", value: e.betterAuthSecret },
        { key: "encryptionKey", value: e.encryptionKey },
        { key: "meshJwtSecret", value: e.meshJwtSecret },
        { key: "localMode", value: e.localMode },
        { key: "allowLocalProd", value: e.allowLocalProd },
        { key: "disableRateLimit", value: e.disableRateLimit },
      ],
    },
    {
      title: "Observability",
      entries: [
        { key: "clickhouseUrl", value: e.clickhouseUrl },
        { key: "otelServiceName", value: e.otelServiceName },
        { key: "disableMonitoringQuery", value: e.disableMonitoringQuery },
      ],
    },
    {
      title: "Event Bus & Networking",
      entries: [{ key: "natsUrls", value: e.natsUrls }],
    },
    {
      title: "Config Files",
      entries: [{ key: "configPath", value: e.configPath }],
    },
    {
      title: "Auth Providers",
      entries: [
        {
          key: "emailAndPassword",
          value: process.env.AUTH_EMAIL_PASSWORD_ENABLED ?? "true",
        },
        { key: "google", value: !!process.env.AUTH_GOOGLE_CLIENT_ID },
        { key: "github", value: !!process.env.AUTH_GITHUB_CLIENT_ID },
        { key: "resend", value: !!process.env.AUTH_RESEND_API_KEY },
        { key: "sendgrid", value: !!process.env.AUTH_SENDGRID_API_KEY },
        { key: "sso", value: !!process.env.AUTH_SSO_MS_CLIENT_ID },
        {
          key: "magicLink",
          value: process.env.AUTH_MAGIC_LINK_ENABLED === "true",
        },
        {
          key: "emailOtp",
          value: process.env.AUTH_EMAIL_OTP_ENABLED === "true",
        },
      ],
    },
    {
      title: "Transport",
      entries: [
        {
          key: "unsafeAllowStdioTransport",
          value: e.unsafeAllowStdioTransport,
        },
      ],
    },
    {
      title: "AI Gateway",
      entries: [
        { key: "aiGatewayEnabled", value: e.aiGatewayEnabled },
        { key: "aiGatewayUrl", value: e.aiGatewayUrl },
      ],
    },
  ];
}

interface ConfigViewProps {
  env: Settings;
}

export function ConfigView({ env: e }: ConfigViewProps) {
  const sections = getConfigSections(e);

  return (
    <Box flexDirection="column">
      {sections.map((section) => (
        <Box key={section.title} flexDirection="column" marginTop={1}>
          <Text dimColor>
            {"  "}── {section.title}{" "}
            {"─".repeat(Math.max(0, 38 - section.title.length))}
          </Text>
          {section.entries.map(({ key, value }) => {
            const formatted = formatValue(key, value);
            return (
              <Box key={key}>
                <Text dimColor>
                  {"  "}
                  {key.padEnd(32)}
                </Text>
                <Text
                  color={formatted.color as never}
                  dimColor={formatted.dimColor}
                >
                  {formatted.text}
                </Text>
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}
