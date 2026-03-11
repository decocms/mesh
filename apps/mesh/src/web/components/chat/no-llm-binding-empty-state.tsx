import { Button } from "@deco/ui/components/button.tsx";
import { EmptyState } from "../empty-state";
import { useSettingsModal } from "@/web/hooks/use-settings-modal";

interface NoLlmBindingEmptyStateProps {
  title?: string;
  description?: string;
  org: { slug: string; id: string };
}

/**
 * Empty state component shown when no LLM binding is available.
 * Directs users to the AI Providers settings page.
 */
export function NoLlmBindingEmptyState({
  title = "No AI provider connected",
  description = "Connect to a model provider to unlock AI-powered features.",
}: NoLlmBindingEmptyStateProps) {
  const { open } = useSettingsModal();

  return (
    <EmptyState
      image={
        <img
          src="/empty-state-openrouter.svg"
          alt=""
          width={336}
          height={320}
          aria-hidden="true"
          className="w-xs h-auto mask-radial-[100%_100%] mask-radial-from-20% mask-radial-to-50% mask-radial-at-center"
        />
      }
      title={title}
      description={description}
      actions={
        <Button onClick={() => open("org.ai-providers")}>
          Set up providers
        </Button>
      }
    />
  );
}
