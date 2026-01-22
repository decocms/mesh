/**
 * a ProjectLocator is a github-like slug string that identifies a project in an organization.
 *
 * format: <org-slug>/<project-slug>
 */

export type LocatorStructured = {
  org: string;
  project: string;
};

export type ProjectLocator = `${string}/${string}`;

export const ORG_ADMIN_PROJECT_SLUG = "org-admin";

export const Locator = {
  from({ org, project }: LocatorStructured): ProjectLocator {
    if (org?.includes("/") || project.includes("/")) {
      throw new Error("Org or project cannot contain slashes");
    }

    return `${org}/${project}` as ProjectLocator;
  },
  parse(locator: ProjectLocator): LocatorStructured {
    if (locator.startsWith("/")) {
      locator = locator.slice(1) as ProjectLocator;
    }
    const [org, project] = locator.split("/");
    if (!org || !project) {
      throw new Error("Invalid locator");
    }
    return { org, project };
  },
  isOrgAdminProject(locator: ProjectLocator): boolean {
    return locator.split("/")[1] === ORG_ADMIN_PROJECT_SLUG;
  },
  adminProject(org: string): ProjectLocator {
    return `${org}/${ORG_ADMIN_PROJECT_SLUG}`;
  },
} as const;
