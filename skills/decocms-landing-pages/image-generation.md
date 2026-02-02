# Image Generation for Landing Pages

Generate professional, on-brand images for decoCMS landing pages using the nano banana agent.

## Visual Style Reference

Use the deco visual style guide for all imagery:
- **Location**: `context/10_design/VISUAL_STYLE.md`
- **Aesthetic**: Retro Comic Hero meets Digital Noir — 1950s-60s comic book art with heavy dithering, CRT effects
- **Colors**: Monochromatic green (`#121110` background, `#D0EC1A` accents)
- **Main Character**: Capybaras — calm, confident, capable heroes doing the work

For personal brand imagery (Guilherme), see `vibegui.com/context/VISUAL_STYLE.md`.

## Workflow

1. **Define concepts** — 2-3 images per page (hero, supporting, CTA)
2. **Generate** — Use nano banana with model `gemini-3-pro-image-preview`
3. **Download** — Save to `static/` directory
4. **Optimize** — Create SEO version if needed (JPEG, ~300KB)
5. **Integrate** — Reference in section props

**Tip**: When generating, pass the visual style file as context:
```
@context/10_design/VISUAL_STYLE.md
```

## Image Types

| Type | Purpose | Dimensions | Location |
|------|---------|------------|----------|
| Hero | Main visual | 1376×768 | Top of page |
| Supporting | Concept visualization | 1376×768 | Mid-sections |
| CTA | Action reinforcement | 1376×768 | Footer area |
| OG/SEO | Social sharing | 1200×630 | Meta tags |

## Prompt Templates

### Professional/Corporate

For proposals, enterprise content:

```
Create a professional digital artwork for an executive AI workshop proposal.

[CONCEPT]: Executives building AI automations with guidance from experts.

Visual elements:
- Business professionals at modern workstations
- AI/automation visual metaphors (flows, connections, data)
- Collaborative atmosphere, learning environment

Style: Modern, clean, corporate but not sterile. Subtle gradients.
Colors: Dark background (#121110) with lime-green accents (#D0EC1A).
Mood: Empowering, professional, sophisticated.

Dimensions: 1376x768 (landscape, 16:9)
No text overlays. High contrast for dark theme.
```

### Technical/Development

For hiring projects, developer-focused:

```
Create a professional digital artwork for a software development hiring project.

[CONCEPT]: MCP server connecting customer data to AI agents for finance workflows.

Visual elements:
- Code/terminal aesthetics
- Data flow connections
- Customer context visualization
- Modern developer environment

Style: Technical but approachable. Clean lines, modern UI aesthetic.
Colors: Dark background (#121110) with lime-green accents (#D0EC1A).
Mood: Innovative, challenging, exciting opportunity.

Dimensions: 1376x768 (landscape, 16:9)
No text overlays. High contrast for dark theme.
```

### Vision/Future

For roadmaps, strategic documents:

```
Create a professional digital artwork for a 2026 company roadmap.

[CONCEPT]: Autonomous AI agents continuously optimizing commerce storefronts.

Visual elements:
- Continuous loop/cycle visualization
- Agent working autonomously
- Store/commerce evolution
- Data flowing, improvements shipping

Style: Futuristic but grounded. Vision meets execution.
Colors: Dark background (#121110) with lime-green accents (#D0EC1A).
Mood: Ambitious, confident, inevitable.

Dimensions: 1376x768 (landscape, 16:9)
No text overlays. High contrast for dark theme.
```

## Concept Mappings

| Content Type | Visual Approach |
|--------------|-----------------|
| AI/Automation | Flowing data, neural networks, agent interfaces |
| Learning/Workshop | People at screens, collaborative spaces |
| Development | Code editors, terminals, architecture diagrams |
| Strategy | Paths, growth, ascending trajectories |
| Integration | Connections, bridges, unified systems |
| Optimization | Metrics improving, loops closing, efficiency |

## Deco Brand Colors

Always specify these in prompts:

```
Colors: Dark background (#121110) with lime-green accents (#D0EC1A).
```

For variety, can also use:
- Purple accent: `#A595FF`
- Yellow accent: `#FFC116`

## Generation Command

Using nano banana agent MCP:

```typescript
GENERATE_IMAGE({
  prompt: "...",
  width: 1376,
  height: 768,
  model: "gemini-3-pro-image-preview"  // Required model
})
```

## Post-Generation

### Download to static

After generation, the image URL is returned. Download it:

```bash
curl -o static/project-concept.png "https://generated-image-url..."
```

### Optimize for SEO

Social platforms have size limits (~300KB for WhatsApp). Create optimized version:

```bash
# Resize to 1200px width and convert to JPEG at 70% quality
sips -Z 1200 --setProperty format jpeg --setProperty formatOptions 70 \
  static/hero.png --out static/hero-og.jpg
```

### Reference in Code

Sections reference images by prop:

```json
{
  "__resolveType": "site/sections/HeroSection.tsx",
  "heroImage": "/project-hero.png"
}
```

Or in defaults:

```tsx
export default function HeroSection({
  image = "/project-hero.png"
}: Props) {
  // ...
}
```

## Naming Convention

```
{project}-{concept}.png

Examples:
- vanto-hero.png
- vanto-bridge.png
- vanto-build.png
- hiring-hero.png
- hiring-tools.png
- hiring-vision.png
- roadmap-q1-proved-model.png
- roadmap-q4-default.png
```

## SEO Image Requirements

For `og:image` / meta image:
- **Absolute URL**: `https://decocms.com/image.jpg`
- **Size**: Max 300KB for WhatsApp
- **Dimensions**: 1200×630px (1.91:1 ratio)
- **Format**: JPEG preferred for smaller size

Configure in page JSON:

```json
"seo": {
  "__resolveType": "website/sections/Seo/SeoV2.tsx",
  "title": "Page Title | deco",
  "description": "Description",
  "image": "https://decocms.com/hero-og.jpg"
}
```

## Example Prompts Used

### Vanto Hero (Executive Workshop)

```
Create a professional digital artwork for an executive AI workshop.

Concept: Business leaders learning to build AI automations themselves, 
guided by experts. The bridge from "70% with ChatGPT" to production-ready.

Visual: Executives at modern workstations, data flowing, AI assistance visible.
Collaborative learning atmosphere. Empowering, not intimidating.

Style: Corporate sophistication meets tech innovation.
Colors: Dark background (#121110) with lime-green accents (#D0EC1A).
Mood: Confident, capable, hands-on.

Dimensions: 1376x768. No text.
```

### Hiring Project Tools

```
Create a professional digital artwork for an MCP server development project.

Concept: Building tools that give AI agents access to customer billing and 
usage data. The MCP as a bridge between raw data and intelligent responses.

Visual: Code/terminal aesthetic, data connections, customer context flowing 
into AI. Modern developer environment.

Style: Technical but approachable.
Colors: Dark background (#121110) with lime-green accents (#D0EC1A).
Mood: Challenging, innovative, opportunity.

Dimensions: 1376x768. No text.
```

### Hiring Project Vision

```
Create a professional digital artwork about agentic workflows in finance.

Concept: AI agents using MCP tools to autonomously handle customer inquiries.
The 6-month vision: from single tool to orchestrated finance automation.

Visual: Agent loops, multiple tools working together, scalability.
Flow from customer question to resolution.

Style: Forward-looking, architectural.
Colors: Dark background (#121110) with lime-green accents (#D0EC1A).
Mood: Visionary, systematic, ambitious.

Dimensions: 1376x768. No text.
```
