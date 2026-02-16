import { useParams } from "react-router";
import Hero from "../components/sections/hero";
import Features from "../components/sections/features";
import Footer from "../components/sections/footer";
import { initEditorBridge, useEditorProps } from "../lib/editor-client";

initEditorBridge();

const sectionRegistry: Record<string, React.ComponentType<any>> = {
  "sections--Hero": Hero,
  "sections--Features": Features,
  "sections--Footer": Footer,
};

interface BlockInstance {
  id: string;
  blockType: string;
  props: Record<string, unknown>;
}

interface PageConfig {
  id: string;
  path: string;
  title: string;
  blocks: BlockInstance[];
  deleted?: boolean;
  metadata?: {
    description?: string;
  };
}

// At build time (prerender), page configs are loaded from .deco/pages/.
// This map is populated by the prerender data loading step.
const pageCache = new Map<string, PageConfig>();

// Eagerly load all page configs using Vite's import.meta.glob
const pageModules = import.meta.glob<PageConfig>("../../.deco/pages/*.json", {
  eager: true,
  import: "default",
});

for (const [, config] of Object.entries(pageModules)) {
  if (config?.path && !config.deleted) {
    pageCache.set(config.path, config);
  }
}

function SectionRenderer({
  block,
  registry,
}: {
  block: BlockInstance;
  registry: Record<string, React.ComponentType<any>>;
}) {
  const props = useEditorProps(block.id, block.props);
  const Section = registry[block.blockType];
  if (!Section) return null;
  return (
    <div data-block-id={block.id}>
      <Section {...props} />
    </div>
  );
}

export default function CatchAllPage() {
  const params = useParams();
  const path = `/${params["*"] ?? ""}`;

  const page = pageCache.get(path);

  if (!page) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="mb-4 text-4xl font-bold text-gray-900">404</h1>
          <p className="text-gray-600">Page not found</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      {page.blocks.map((block) => (
        <SectionRenderer
          key={block.id}
          block={block}
          registry={sectionRegistry}
        />
      ))}
    </main>
  );
}
