import { createContext, PropsWithChildren, useContext } from "react";
import { Locator, ProjectLocator } from "../lib/locator";

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
