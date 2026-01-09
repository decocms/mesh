import { storeRouter } from "../index";

export default function McpServerDetailPage() {
  const { appName } = storeRouter.useParams({ from: "/$appName" });
  const { registryId, serverName } = storeRouter.useSearch({
    from: "/$appName",
  });
  const location = storeRouter.useLocation();
  const navigate = storeRouter.useNavigate();
  const Link = storeRouter.Link;

  return (
    <div className="p-6">
      <div className="mb-6">
        <button
          onClick={() => navigate({ to: "/" })}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to Store
        </button>
      </div>

      <h1 className="text-2xl font-bold mb-2">MCP Server: {appName}</h1>

      <div className="space-y-2 text-sm mb-6">
        <p className="text-muted-foreground">
          Path:{" "}
          <code className="bg-muted px-1 rounded">{location.pathname}</code>
        </p>
        {serverName && (
          <p>
            Server Name: <span className="font-medium">{serverName}</span>
          </p>
        )}
        {registryId && (
          <p>
            Registry ID: <span className="font-medium">{registryId}</span>
          </p>
        )}
      </div>

      <div className="border rounded-lg p-6 bg-muted/30">
        <h2 className="font-semibold mb-4">Server Details</h2>
        <p className="text-muted-foreground">
          This is a placeholder for the {appName} MCP server details page.
        </p>
      </div>

      <div className="mt-8 border-t pt-6">
        <h2 className="text-lg font-semibold mb-4">Quick Navigation</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/"
            className="px-3 py-1.5 text-sm border rounded hover:bg-muted transition-colors"
          >
            Store Home
          </Link>
          <button
            onClick={() =>
              navigate({
                to: "/$appName",
                params: { appName: "github" },
                search: { serverName: "GitHub MCP" },
              })
            }
            className="px-3 py-1.5 text-sm border rounded hover:bg-muted transition-colors"
          >
            GitHub
          </button>
          <button
            onClick={() =>
              navigate({
                to: "/$appName",
                params: { appName: "slack" },
                search: { serverName: "Slack MCP" },
              })
            }
            className="px-3 py-1.5 text-sm border rounded hover:bg-muted transition-colors"
          >
            Slack
          </button>
          <button
            onClick={() =>
              navigate({
                to: "/$appName",
                params: { appName: "notion" },
              })
            }
            className="px-3 py-1.5 text-sm border rounded hover:bg-muted transition-colors"
          >
            Notion
          </button>
        </div>
      </div>
    </div>
  );
}
