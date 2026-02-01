# UI Components

Mesh uses a shadcn-based component library in `packages/ui/`. Import from `@decocms/ui`.

## Available Components

### Layout
- `Card`, `CardHeader`, `CardContent`, `CardFooter`
- `Dialog`, `DialogTrigger`, `DialogContent`
- `Sheet`, `SheetTrigger`, `SheetContent`
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
- `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent`

### Forms
- `Button` - Primary action button
- `Input` - Text input
- `Textarea` - Multi-line input
- `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`
- `Checkbox`
- `Switch`
- `Label`

### Data Display
- `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`
- `Badge`
- `Avatar`, `AvatarImage`, `AvatarFallback`
- `Tooltip`, `TooltipTrigger`, `TooltipContent`

### Feedback
- `Alert`, `AlertTitle`, `AlertDescription`
- `Progress`
- `Skeleton`
- `Toast` (via Sonner)

## Usage Examples

### Button Variants
```tsx
import { Button } from "@decocms/ui";

<Button>Default</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Delete</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
```

### Card
```tsx
import { Card, CardHeader, CardContent } from "@decocms/ui";

<Card>
  <CardHeader>
    <h3 className="font-semibold">Card Title</h3>
  </CardHeader>
  <CardContent>
    <p>Card content goes here</p>
  </CardContent>
</Card>
```

### Dialog
```tsx
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@decocms/ui";

<Dialog>
  <DialogTrigger asChild>
    <Button>Open Dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
      <DialogDescription>Dialog description</DialogDescription>
    </DialogHeader>
    <div>Dialog content</div>
  </DialogContent>
</Dialog>
```

### Select
```tsx
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@decocms/ui";

<Select value={value} onValueChange={setValue}>
  <SelectTrigger>
    <SelectValue placeholder="Select an option" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">Option 1</SelectItem>
    <SelectItem value="option2">Option 2</SelectItem>
  </SelectContent>
</Select>
```

### Toast
```tsx
import { toast } from "sonner";

// Success
toast.success("Operation completed");

// Error
toast.error("Something went wrong");

// With description
toast("Title", {
  description: "More details here",
});
```

## Icons

Use icons from `@untitledui/icons`:

```tsx
import { Home, Settings, Plus, Trash02 } from "@untitledui/icons";

<Home size={20} />
<Settings size={16} className="text-muted-foreground" />
```

Common icons:
- Navigation: `Home`, `Menu`, `ChevronLeft`, `ChevronRight`, `ChevronDown`
- Actions: `Plus`, `Trash02`, `Edit02`, `Copy`, `Download`, `Upload`
- Status: `Check`, `X`, `AlertCircle`, `Info`, `Loading01`
- Files: `File04`, `Folder`, `FolderOpen`

## Patterns

### Loading States
```tsx
import { Loading01 } from "@untitledui/icons";

{isLoading ? (
  <div className="flex items-center gap-2 text-muted-foreground">
    <Loading01 size={16} className="animate-spin" />
    <span>Loading...</span>
  </div>
) : (
  <Content />
)}
```

### Empty States
```tsx
<div className="flex flex-col items-center justify-center p-8 text-center">
  <Folder size={48} className="text-muted-foreground mb-4" />
  <h3 className="font-medium mb-1">No items yet</h3>
  <p className="text-sm text-muted-foreground mb-4">
    Get started by creating your first item.
  </p>
  <Button>
    <Plus size={16} className="mr-2" />
    Create Item
  </Button>
</div>
```

### Form Layout
```tsx
<form className="space-y-4">
  <div className="space-y-2">
    <Label htmlFor="name">Name</Label>
    <Input id="name" placeholder="Enter name" />
  </div>
  <div className="space-y-2">
    <Label htmlFor="description">Description</Label>
    <Textarea id="description" placeholder="Enter description" />
  </div>
  <div className="flex justify-end gap-2">
    <Button variant="outline">Cancel</Button>
    <Button type="submit">Save</Button>
  </div>
</form>
```
