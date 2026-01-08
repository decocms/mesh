/**
 * Demo seed configuration and constants
 */

import type { DemoUser } from "./types";

export const DEMO_CONFIG = {
  PASSWORD: "demo123",
  EMAIL_DOMAIN: "@demo.local",
  ORG_NAME: "Demo Company",
  ORG_SLUG: "demo-company",
  USER_AGENT_DEFAULT: "mesh-demo-client/1.0",
} as const;

export const DEMO_USERS: Record<string, DemoUser> = {
  admin: {
    role: "admin",
    name: "Demo Admin",
    email: `admin${DEMO_CONFIG.EMAIL_DOMAIN}`,
  },
  developer: {
    role: "member",
    name: "Demo Developer",
    email: `developer${DEMO_CONFIG.EMAIL_DOMAIN}`,
  },
  analyst: {
    role: "member",
    name: "Demo Analyst",
    email: `analyst${DEMO_CONFIG.EMAIL_DOMAIN}`,
  },
  billing: {
    role: "member",
    name: "Demo Billing",
    email: `billing${DEMO_CONFIG.EMAIL_DOMAIN}`,
  },
  viewer: {
    role: "member",
    name: "Demo Viewer",
    email: `viewer${DEMO_CONFIG.EMAIL_DOMAIN}`,
  },
} as const;

export const DEMO_MEMBER_ROLES: Record<string, "owner" | "member"> = {
  admin: "owner",
  developer: "member",
  analyst: "member",
  billing: "member",
  viewer: "member",
} as const;
