import { createContext, useContext, type PropsWithChildren } from "react";

/**
 * Locator pattern for identifying org/project scope.
 * Template literal type for strict type checking: "org/project"
 */
export type ProjectLocator = `${string}/${string}`;

export type LocatorStructured = {
  org: string;
  project: string;
};

export const Locator = {
  from: ({ org, project }: LocatorStructured): ProjectLocator => {
    if (org?.includes("/") || project.includes("/")) {
      throw new Error("Org or project cannot contain slashes");
    }
    return `${org}/${project}` as ProjectLocator;
  },
  parse: (locator: ProjectLocator): LocatorStructured => {
    if (locator.startsWith("/")) {
      locator = locator.slice(1) as ProjectLocator;
    }
    const [org, project] = locator.split("/");
    if (!org || !project) {
      throw new Error("Invalid locator");
    }
    return { org, project };
  },
};

interface ProjectContextType {
  org: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
  };

  project: {
    name?: string;
    slug: string;
  };

  locator: ProjectLocator;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const useProjectContext = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error(
      "useProjectContext must be used within a ProjectContextProvider",
    );
  }

  return context;
};

export type ProjectContextProviderProps = {
  org: { id: string; slug: string; name: string; logo: string | null };
  project: { name?: string; slug: string };
};

export const ProjectContextProvider = ({
  children,
  org,
  project,
}: PropsWithChildren<ProjectContextProviderProps>) => {
  const locator = Locator.from({ org: org.slug, project: project.slug });

  const value = { org, project, locator };

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
};
