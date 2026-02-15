import type { Route } from "./+types/home";
import Hero from "../components/sections/hero";
import Features from "../components/sections/features";
import Footer from "../components/sections/footer";
import pageConfig from "../../.deco/pages/page_home.json";

const sectionRegistry: Record<string, React.ComponentType<any>> = {
  "sections--Hero": Hero,
  "sections--Features": Features,
  "sections--Footer": Footer,
};

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
      {pageConfig.blocks.map((block) => {
        const Section = sectionRegistry[block.blockType];
        if (!Section) {
          console.warn(`Unknown block type: ${block.blockType}`);
          return null;
        }
        return <Section key={block.id} {...block.props} />;
      })}
    </main>
  );
}
