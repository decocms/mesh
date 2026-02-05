// heavily inspired by https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/scripts/generate-json-schema.ts
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGenerator } from "ts-json-schema-generator";
import type { Config, Schema } from "ts-json-schema-generator";

// Use standard ESM __dirname pattern for cross-runtime compatibility
const __dirname = dirname(fileURLToPath(import.meta.url));

const config: Config = {
  path: join(__dirname, "../src/wrangler.ts"),
  tsconfig: join(__dirname, "../tsconfig.json"),
  type: "WranglerConfig",
  skipTypeCheck: true,
};

const applyFormattingRules = (schema: Schema) => {
  return { ...schema, allowTrailingCommas: true };
};

const schema = applyFormattingRules(
  createGenerator(config).createSchema(config.type),
);

writeFileSync(
  join(__dirname, "../config-schema.json"),
  JSON.stringify(schema, null, 2),
);
