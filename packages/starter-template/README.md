# deco.cx Starter Template

A starter template for building sites with deco.cx -- the stack-agnostic CMS for TypeScript.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to see your site.

## Project Structure

```
app/
  components/
    sections/         # Page sections with typed props (CMS-editable)
      hero.tsx        # Full-width hero with headline and CTA
      features.tsx    # Feature grid with icons
      footer.tsx      # Site footer with links
  loaders/            # Data loaders (fetchers with typed input/output)
    products.ts       # Example product loader
  routes/             # React Router 7 page routes
    home.tsx          # Home page (renders sections from .deco/pages/)
    $.tsx             # Catch-all for CMS-managed pages
  root.tsx            # Root layout
.deco/
  pages/              # Page compositions (which sections appear on which page)
  blocks/             # Block definitions (JSON Schema for each section)
  loaders/            # Loader definitions (input/output schemas)
```

## Adding a New Section

1. Create a component in `app/components/sections/`:

```tsx
// app/components/sections/banner.tsx
export interface BannerProps {
  /** Banner message */
  message: string;
  /** Background color */
  bgColor?: string;
}

export default function Banner({ message, bgColor = "#f0f0f0" }: BannerProps) {
  return <div style={{ backgroundColor: bgColor }}>{message}</div>;
}
```

2. Run the CMS scanner to generate the block definition in `.deco/blocks/`.

3. Register the section in your route's `sectionRegistry`.

## Adding a New Page

Create a JSON file in `.deco/pages/`:

```json
{
  "id": "page_about",
  "path": "/about",
  "title": "About",
  "blocks": [
    {
      "id": "block_hero_about",
      "blockType": "sections--Hero",
      "props": {
        "title": "About Us",
        "subtitle": "Our story",
        "ctaText": "Contact",
        "ctaUrl": "/contact"
      }
    }
  ]
}
```

Pages are automatically discovered by the prerender config at build time.

## Building for Production

```bash
npm run build
```

This prerenders all CMS pages as static HTML using React Router 7's prerender feature. The build reads `.deco/pages/` to discover all routes.

## Learn More

- [deco.cx Documentation](https://deco.cx/docs)
- [React Router 7](https://reactrouter.com/)
- [Tailwind CSS 4](https://tailwindcss.com/)
