# Studio - AI-Native TypeScript Content Editor

A modern content editor that generates rich forms from TypeScript types.

## Features

- 🔄 **TypeScript to JSON Schema**: Paste your TypeScript types and get a fully functional form
- 🎨 **Rich Form Editor**: Beautiful shadcn-based form components with validation
- 📋 **JSON Preview**: Real-time preview of the generated content as JSON
- 🤖 **AI-Native**: Designed for AI-powered type extraction (extensible)
- 🔌 **Headless**: Output pure JSON compatible with any rendering stack

## Quick Start

```bash
# Install dependencies
bun install

# Run development server
bun run dev
```

Open http://localhost:4100 to start editing content.

## How It Works

1. **Extract Types**: Paste TypeScript interfaces/types in the "Extract Types" tab
2. **Generate Schema**: Click "Generate Schema" to create a JSON Schema
3. **Edit Content**: Use the rich form editor to create content
4. **Export JSON**: Copy the generated JSON for use in your application

## Architecture

```
apps/studio/
├── src/
│   ├── components/
│   │   ├── content-editor.tsx    # Main RJSF form wrapper
│   │   ├── type-extractor.tsx    # TypeScript code input
│   │   ├── schema-manager.tsx    # Saved schemas list
│   │   ├── json-preview.tsx      # JSON output preview
│   │   ├── widgets/              # Custom form widgets
│   │   └── templates/            # Custom field templates
│   ├── lib/
│   │   └── schema-extractor.ts   # TypeScript → JSON Schema
│   └── server/
│       └── index.ts              # API server (for AI extraction)
```

## Tech Stack

- **React 19** with React Compiler
- **Vite** for fast development
- **Tailwind CSS v4** for styling
- **@deco/ui** (shadcn-based) for components
- **@rjsf/core** for JSON Schema forms
- **Monaco Editor** for code editing
- **Hono** for API server

## Future Roadmap

- [ ] AI-powered type extraction via LLM
- [ ] Persistent schema storage
- [ ] Preview integration with rendering frameworks
- [ ] Collaborative editing
- [ ] Version history
- [ ] Import/export schemas

