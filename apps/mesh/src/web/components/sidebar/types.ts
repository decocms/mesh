import type { ReactNode } from "react";

export interface NavigationSidebarItem {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  isActive?: boolean;
}

export interface Invitation {
  id: string;
  organizationId: string;
  organizationName?: string;
  organizationSlug?: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date;
  inviterId: string;
  inviter?: {
    name?: string;
    email?: string;
    image?: string;
  };
}
