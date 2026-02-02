# Design Tokens

Use these Tailwind design system tokens for consistent styling. Avoid arbitrary values.

## Colors

### Semantic Colors (Preferred)
```
background / foreground     - Page background & text
card / card-foreground      - Card surfaces
popover / popover-foreground - Dropdowns, tooltips
primary / primary-foreground - Primary actions
secondary / secondary-foreground - Secondary actions
muted / muted-foreground    - Disabled, subtle text
accent / accent-foreground  - Hover states
destructive / destructive-foreground - Delete actions
border                      - Borders
input                       - Input borders
ring                        - Focus rings
```

### Usage Examples
```tsx
// Good - uses design tokens
<div className="bg-card text-card-foreground border-border" />
<button className="bg-primary text-primary-foreground hover:bg-primary/90" />
<p className="text-muted-foreground" />

// Bad - arbitrary colors
<div className="bg-gray-100 text-gray-900" />
<button className="bg-blue-500 text-white" />
```

## Spacing

Use Tailwind's default spacing scale:
- `p-1` to `p-12` for padding
- `m-1` to `m-12` for margin
- `gap-1` to `gap-12` for flex/grid gaps
- `space-x-1` to `space-x-12` for horizontal spacing
- `space-y-1` to `space-y-12` for vertical spacing

Common patterns:
```tsx
<div className="p-4" />        // Standard padding
<div className="p-6" />        // Card/section padding
<div className="gap-2" />      // Tight spacing
<div className="gap-4" />      // Normal spacing
<div className="gap-6" />      // Loose spacing
```

## Typography

```
text-xs   - 12px - Captions, badges
text-sm   - 14px - Secondary text, form labels
text-base - 16px - Body text
text-lg   - 18px - Subheadings
text-xl   - 20px - Section titles
text-2xl  - 24px - Page titles
```

Font weights:
```
font-normal   - 400 - Body text
font-medium   - 500 - Labels, buttons
font-semibold - 600 - Headings
font-bold     - 700 - Emphasis
```

## Border Radius

```
rounded-sm  - 2px
rounded     - 4px - Buttons, inputs
rounded-md  - 6px - Cards
rounded-lg  - 8px - Modals, large cards
rounded-xl  - 12px
rounded-full - Pills, avatars
```

## Shadows

```
shadow-sm  - Subtle elevation
shadow     - Cards
shadow-md  - Dropdowns
shadow-lg  - Modals
```

## Common Patterns

### Cards
```tsx
<div className="bg-card border border-border rounded-lg p-4">
  <h3 className="font-semibold">Title</h3>
  <p className="text-sm text-muted-foreground">Description</p>
</div>
```

### Buttons
```tsx
// Primary
<button className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium" />

// Secondary
<button className="border border-border hover:bg-accent px-4 py-2 rounded-md font-medium" />

// Destructive
<button className="bg-destructive text-destructive-foreground hover:bg-destructive/90 px-4 py-2 rounded-md font-medium" />
```

### Inputs
```tsx
<input className="border border-input bg-background px-3 py-2 rounded-md text-sm focus:ring-2 focus:ring-ring" />
```

### Muted Sections
```tsx
<div className="bg-muted/30 rounded-lg p-4">
  <span className="text-muted-foreground">Subtle content</span>
</div>
```
