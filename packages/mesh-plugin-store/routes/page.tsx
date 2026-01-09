import { storeRouter } from "../index";

const SAMPLE_APPS = [
  { id: "github", name: "GitHub MCP", description: "GitHub API integration" },
  {
    id: "slack",
    name: "Slack MCP",
    description: "Slack messaging integration",
  },
  { id: "notion", name: "Notion MCP", description: "Notion workspace access" },
  { id: "linear", name: "Linear MCP", description: "Linear issue tracking" },
  { id: "postgres", name: "PostgreSQL MCP", description: "Database querying" },
];

export default function StorePage() {
  const navigate = storeRouter.useNavigate();
  const location = storeRouter.useLocation();
  const Link = storeRouter.Link;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">MCP Store</h1>
      <p className="text-muted-foreground mb-6">
        Browse and install MCP servers for your workspace.
      </p>

      <div className="text-sm text-muted-foreground mb-4">
        Current path:{" "}
        <code className="bg-muted px-1 rounded">{location.pathname}</code>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SAMPLE_APPS.map((app) => (
          <div
            key={app.id}
            className="border rounded-lg p-4 hover:border-primary transition-colors cursor-pointer"
            onClick={() =>
              navigate({
                to: "/$appName",
                params: { appName: app.id },
                search: { serverName: app.name },
              })
            }
          >
            <h3 className="font-semibold">{app.name}</h3>
            <p className="text-sm text-muted-foreground">{app.description}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 border-t pt-6">
        <h2 className="text-lg font-semibold mb-4">Navigation Test Links</h2>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_APPS.map((app) => (
            <Link
              key={app.id}
              to="/$appName"
              params={{ appName: app.id }}
              search={{ registryId: "test-registry" }}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:opacity-90"
            >
              {app.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
