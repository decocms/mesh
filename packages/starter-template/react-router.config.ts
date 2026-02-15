import type { Config } from "@react-router/dev/config";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

export default {
  ssr: false,
  async prerender() {
    const pagesDir = join(process.cwd(), ".deco/pages");
    const staticPaths = ["/"];

    try {
      const files = await readdir(pagesDir);
      const cmsPages = await Promise.all(
        files
          .filter((f) => f.endsWith(".json"))
          .map(async (f) => {
            const content = await readFile(join(pagesDir, f), "utf-8");
            const page = JSON.parse(content);
            if (page.deleted) return null;
            return page.path;
          }),
      );
      return [...staticPaths, ...cmsPages.filter(Boolean)];
    } catch {
      return staticPaths;
    }
  },
} satisfies Config;
