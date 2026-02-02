import { ReadmeViewer } from "@/web/components/readme";

interface ReadmeTabProps {
  repository: {
    url?: string;
    source?: string;
    subfolder?: string;
  };
}

export function ReadmeTab({ repository }: ReadmeTabProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <ReadmeViewer repository={repository} />
    </div>
  );
}
