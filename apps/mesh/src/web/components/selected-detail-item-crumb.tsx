import { useConnection } from "@/web/hooks/collections/use-connection";
import { useGateway } from "@/web/hooks/collections/use-gateway";
import { useDetailRouteContext } from "@/web/hooks/use-detail-route-context";
import { useNavigate } from "@tanstack/react-router";
import { Container, CpuChip02 } from "@untitledui/icons";

type DetailCrumbProps = {
  icon: string | null | undefined;
  title: string;
  onClick: () => void;
  fallbackIcon: typeof CpuChip02 | typeof Container;
};

function DetailCrumb({
  icon,
  title,
  onClick,
  fallbackIcon: FallbackIcon,
}: DetailCrumbProps) {
  // Check if icon is a URL
  const isIconUrl = icon && /^https?:\/\/.+/.test(icon);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted/50 transition-colors text-sm group"
    >
      <div className="flex items-center justify-center shrink-0">
        {isIconUrl ? (
          <img
            src={icon}
            alt={title}
            className="h-4 w-4 rounded object-cover"
          />
        ) : (
          <FallbackIcon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        )}
      </div>
      <span className="truncate max-w-[200px] text-foreground/90 group-hover:text-foreground">
        {title}
      </span>
    </button>
  );
}

function SelectedGatewayCrumb({
  gatewayId,
  org,
}: {
  gatewayId: string;
  org: string;
}) {
  const navigate = useNavigate();
  const gateway = useGateway(gatewayId);

  // Don't render until gateway is loaded
  if (!gateway) {
    return null;
  }

  const handleClick = () => {
    navigate({
      to: "/$org/gateways/$gatewayId",
      params: { org, gatewayId },
    });
  };

  return (
    <DetailCrumb
      icon={gateway.icon ?? null}
      title={gateway.title}
      onClick={handleClick}
      fallbackIcon={CpuChip02}
    />
  );
}

function SelectedConnectionCrumb({
  connectionId,
  org,
}: {
  connectionId: string;
  org: string;
}) {
  const navigate = useNavigate();
  const connection = useConnection(connectionId);

  // Don't render until connection is loaded
  if (!connection) {
    return null;
  }

  const handleClick = () => {
    navigate({
      to: "/$org/mcps/$connectionId",
      params: { org, connectionId },
    });
  };

  return (
    <DetailCrumb
      icon={connection.icon}
      title={connection.title}
      onClick={handleClick}
      fallbackIcon={Container}
    />
  );
}

/**
 * Renders a breadcrumb-like chip showing the currently selected gateway or connection
 * beside the org switcher when on a detail route.
 */
export function SelectedDetailItemCrumb() {
  const detailContext = useDetailRouteContext();

  // Don't render if not on a detail route
  if (!detailContext) {
    return null;
  }

  const { kind, org, itemId } = detailContext;

  if (kind === "gateway") {
    return <SelectedGatewayCrumb gatewayId={itemId} org={org} />;
  }

  return <SelectedConnectionCrumb connectionId={itemId} org={org} />;
}
