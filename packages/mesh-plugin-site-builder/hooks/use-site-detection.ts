/**
 * Site Detection Hook
 *
 * Detects if a connection is a Deco site by reading deno.json
 * and checking for deco/ imports in the imports map.
 */

import { useQuery } from "@tanstack/react-query";
import { usePluginContext } from "@decocms/bindings/plugins";
import { SITE_BUILDER_BINDING } from "../lib/binding";
import { KEYS } from "../lib/query-keys";

export interface SiteDetectionResult {
  isDeco: boolean;
  hasDenoJson: boolean;
  decoImports: string[];
  error?: string;
}

/**
 * Hook to detect if the current connection is a Deco site.
 * Reads deno.json and checks for deco/ imports.
 */
export function useSiteDetection() {
  const { connectionId, toolCaller, connection } =
    usePluginContext<typeof SITE_BUILDER_BINDING>();

  // Check if read_file tool is available
  const hasReadFile = connection?.tools?.some((t) => t.name === "read_file");

  return useQuery({
    queryKey: KEYS.siteDetection(connectionId ?? ""),
    queryFn: async (): Promise<SiteDetectionResult> => {
      if (!hasReadFile) {
        return {
          isDeco: false,
          hasDenoJson: false,
          decoImports: [],
          error: "Connection does not support read_file",
        };
      }

      try {
        // Read deno.json file
        const untypedToolCaller = toolCaller as unknown as (
          name: string,
          args: Record<string, unknown>,
        ) => Promise<{ content?: string } | string>;

        const result = await untypedToolCaller("read_file", {
          path: "deno.json",
        });

        const content =
          typeof result === "string"
            ? result
            : typeof result === "object" && result.content
              ? result.content
              : null;

        if (!content) {
          return {
            isDeco: false,
            hasDenoJson: false,
            decoImports: [],
            error: "deno.json not found or empty",
          };
        }

        // Parse deno.json
        const denoConfig = JSON.parse(content) as {
          imports?: Record<string, string>;
          importMap?: string;
        };

        // Check for deco/ imports in the imports map
        const imports = denoConfig.imports || {};
        const decoImports = Object.keys(imports).filter(
          (key) => key.startsWith("deco/") || imports[key]?.includes("deco.cx"),
        );

        const isDeco = decoImports.length > 0;

        return {
          isDeco,
          hasDenoJson: true,
          decoImports,
        };
      } catch (error) {
        // File doesn't exist or parse error
        return {
          isDeco: false,
          hasDenoJson: false,
          decoImports: [],
          error:
            error instanceof Error ? error.message : "Failed to read deno.json",
        };
      }
    },
    enabled: !!connectionId && hasReadFile,
    staleTime: 30000, // Consider data fresh for 30 seconds
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}
