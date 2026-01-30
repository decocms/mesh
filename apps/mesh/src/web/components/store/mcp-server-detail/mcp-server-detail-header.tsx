import { Page } from "@/web/components/page";
import type { ReactNode } from "react";

interface MCPServerDetailHeaderProps {
  breadcrumb?: ReactNode;
}

export function MCPServerDetailHeader({
  breadcrumb,
}: MCPServerDetailHeaderProps) {
  return (
    <Page.Header>
      <Page.Header.Left>{breadcrumb}</Page.Header.Left>
    </Page.Header>
  );
}
