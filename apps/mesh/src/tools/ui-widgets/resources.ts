import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps";

interface UIWidgetResource {
  name: string;
  description: string;
  /** Route path for React-based widgets (e.g. "/_widgets/counter") */
  path: string;
  exampleInput: Record<string, unknown>;
}

const UI_WIDGET_RESOURCES: Record<string, UIWidgetResource> = {
  "/_widgets/area-chart": {
    name: "Area Chart",
    description: "Display an area chart with gradient fill",
    path: "/_widgets/area-chart",
    exampleInput: {
      data: [
        { label: "Jan", value: 10 },
        { label: "Feb", value: 25 },
        { label: "Mar", value: 18 },
        { label: "Apr", value: 35 },
      ],
      title: "Revenue",
    },
  },
  "/_widgets/avatar": {
    name: "Avatar",
    description: "Display a user avatar with optional status indicator",
    path: "/_widgets/avatar",
    exampleInput: { name: "Jane Doe", status: "online" },
  },
  "/_widgets/calendar": {
    name: "Calendar",
    description: "Display a mini calendar with highlighted dates",
    path: "/_widgets/calendar",
    exampleInput: { month: 2, year: 2026, highlightedDates: [14, 20, 25] },
  },
  "/_widgets/chart": {
    name: "Chart",
    description: "Display an animated bar chart with labeled data points",
    path: "/_widgets/chart",
    exampleInput: {
      data: [
        { label: "Mon", value: 40 },
        { label: "Tue", value: 80 },
        { label: "Wed", value: 60 },
        { label: "Thu", value: 90 },
        { label: "Fri", value: 50 },
      ],
      title: "Weekly Stats",
    },
  },
  "/_widgets/code?borderless=true": {
    name: "Code",
    description: "Display a syntax-highlighted code snippet",
    path: "/_widgets/code?borderless=true",
    exampleInput: {
      code: "const greet = (name: string) => `Hello, ${name}!`;",
      language: "typescript",
    },
  },
  "/_widgets/confirmation": {
    name: "Confirmation",
    description: "Display a confirmation dialog with customizable actions",
    path: "/_widgets/confirmation",
    exampleInput: {
      title: "Delete item?",
      message: "This action cannot be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
    },
  },
  "/_widgets/counter": {
    name: "Counter",
    description: "Interactive counter widget with increment/decrement controls",
    path: "/_widgets/counter",
    exampleInput: { initialValue: 42, label: "My Counter" },
  },
  "/_widgets/diff": {
    name: "Diff",
    description: "Display a side-by-side text diff viewer",
    path: "/_widgets/diff",
    exampleInput: {
      before: "Hello world\nLine two",
      after: "Hello there\nLine two\nLine three",
      title: "Changes",
    },
  },
  "/_widgets/error?borderless=true": {
    name: "Error",
    description: "Display an error message with optional code and details",
    path: "/_widgets/error?borderless=true",
    exampleInput: {
      message: "Connection refused",
      code: "ECONNREFUSED",
      details: "Could not connect to database at localhost:5432",
    },
  },
  "/_widgets/form-result": {
    name: "Form Result",
    description: "Display a form submission result summary",
    path: "/_widgets/form-result",
    exampleInput: {
      title: "Registration",
      success: true,
      fields: [
        { label: "Name", value: "Jane Doe" },
        { label: "Email", value: "jane@example.com" },
      ],
    },
  },
  "/_widgets/greeting": {
    name: "Greeting",
    description: "Display a personalized greeting card",
    path: "/_widgets/greeting",
    exampleInput: { name: "Alice", message: "Welcome back!" },
  },
  "/_widgets/image": {
    name: "Image",
    description: "Display an image with optional caption",
    path: "/_widgets/image",
    exampleInput: {
      src: "https://picsum.photos/400/200",
      alt: "Sample image",
      caption: "A beautiful landscape",
    },
  },
  "/_widgets/json-viewer": {
    name: "JSON Viewer",
    description: "Display an interactive JSON tree viewer",
    path: "/_widgets/json-viewer",
    exampleInput: {
      data: { user: { name: "Alice", age: 30 }, active: true },
      title: "User Data",
    },
  },
  "/_widgets/kbd": {
    name: "Keyboard Shortcuts",
    description: "Display keyboard shortcut reference",
    path: "/_widgets/kbd",
    exampleInput: {
      shortcuts: [
        { keys: ["Ctrl", "S"], description: "Save" },
        { keys: ["Ctrl", "Z"], description: "Undo" },
        { keys: ["Ctrl", "Shift", "Z"], description: "Redo" },
      ],
    },
  },
  "/_widgets/markdown": {
    name: "Markdown",
    description: "Display rendered markdown content",
    path: "/_widgets/markdown",
    exampleInput: {
      content:
        "# Hello\n\nThis is **bold** and *italic* text.\n\n- Item 1\n- Item 2",
      title: "README",
    },
  },
  "/_widgets/metric": {
    name: "Metric",
    description: "Key metric display with value, unit, and trend indicator",
    path: "/_widgets/metric",
    exampleInput: { value: 1234, label: "Revenue", unit: "$", trend: 12.5 },
  },
  "/_widgets/notification?borderless=true": {
    name: "Notification",
    description: "Display a notification banner with type styling",
    path: "/_widgets/notification?borderless=true",
    exampleInput: {
      type: "success",
      title: "Saved",
      message: "Your changes have been saved successfully.",
    },
  },
  "/_widgets/progress": {
    name: "Progress",
    description: "Display a visual progress bar with label and percentage",
    path: "/_widgets/progress",
    exampleInput: { value: 65, max: 100, label: "Upload progress" },
  },
  "/_widgets/quote?borderless=true": {
    name: "Quote",
    description: "Quote display with author attribution",
    path: "/_widgets/quote?borderless=true",
    exampleInput: {
      text: "The only way to do great work is to love what you do.",
      author: "Steve Jobs",
    },
  },
  "/_widgets/rating": {
    name: "Rating",
    description: "Display a star rating indicator",
    path: "/_widgets/rating",
    exampleInput: { value: 4, max: 5, label: "Product Rating" },
  },
  "/_widgets/slider": {
    name: "Slider",
    description: "Display a range slider control",
    path: "/_widgets/slider",
    exampleInput: { value: 70, min: 0, max: 100, label: "Volume" },
  },
  "/_widgets/sparkline": {
    name: "Sparkline",
    description: "Display a compact sparkline trend chart",
    path: "/_widgets/sparkline",
    exampleInput: {
      values: [10, 25, 15, 40, 30, 55, 45],
      label: "Revenue",
    },
  },
  "/_widgets/stats-grid?borderless=true": {
    name: "Stats Grid",
    description: "Display a grid of dashboard statistics",
    path: "/_widgets/stats-grid?borderless=true",
    exampleInput: {
      stats: [
        { label: "Users", value: "1,234", trend: 5.2 },
        { label: "Revenue", value: "9,800", unit: "$", trend: 12.1 },
        { label: "Errors", value: "3", trend: -40 },
        { label: "Uptime", value: "99.9", unit: "%" },
      ],
    },
  },
  "/_widgets/status": {
    name: "Status",
    description: "Display a status badge indicator",
    path: "/_widgets/status",
    exampleInput: { status: "online", label: "API Server" },
  },
  "/_widgets/switch": {
    name: "Switch",
    description: "Display a toggle switch control",
    path: "/_widgets/switch",
    exampleInput: {
      label: "Dark mode",
      description: "Enable dark theme",
      checked: false,
    },
  },
  "/_widgets/table": {
    name: "Table",
    description: "Display a data table with columns and rows",
    path: "/_widgets/table",
    exampleInput: {
      columns: ["Name", "Status", "Count"],
      rows: [
        ["Alice", "Active", "42"],
        ["Bob", "Pending", "17"],
        ["Carol", "Active", "98"],
      ],
      title: "Users",
    },
  },
  "/_widgets/timer": {
    name: "Timer",
    description: "Display an interactive countdown timer",
    path: "/_widgets/timer",
    exampleInput: { duration: 300, label: "Session Timer" },
  },
  "/_widgets/todo": {
    name: "Todo",
    description: "Display an interactive todo list",
    path: "/_widgets/todo",
    exampleInput: {
      title: "Sprint Tasks",
      items: [
        { text: "Write tests", completed: true },
        { text: "Update docs", completed: false },
        { text: "Deploy to staging", completed: false },
      ],
    },
  },
};

export function getUIWidgetResource(uri: string): UIWidgetResource | undefined {
  return UI_WIDGET_RESOURCES[uri];
}

export function listUIWidgetResources(): Array<{
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  exampleInput: Record<string, unknown>;
}> {
  return Object.entries(UI_WIDGET_RESOURCES).map(([uri, resource]) => ({
    uri,
    name: resource.name,
    description: resource.description,
    mimeType: RESOURCE_MIME_TYPE,
    exampleInput: resource.exampleInput,
  }));
}
