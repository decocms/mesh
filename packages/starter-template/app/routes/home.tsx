import type { Route } from "./+types/home";
import Hero from "../components/sections/hero";
import Features from "../components/sections/features";
import Footer from "../components/sections/footer";
import pageConfig from "../../.deco/pages/page_home.json";
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

export function meta(_args: Route.MetaArgs) {
  return [
    { title: pageConfig.title ?? "Home" },
    {
      name: "description",
      content:
        pageConfig.metadata?.description ?? "Welcome to your deco.cx site",
    },
  ];
}

export default function Home() {
  return (
    <main>
      {pageConfig.blocks.map((block) => (
        <SectionRenderer
          key={block.id}
          block={block}
          registry={sectionRegistry}
        />
      ))}
    </main>
  );
}
