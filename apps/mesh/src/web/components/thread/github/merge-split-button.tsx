import { Button } from "@deco/ui/components/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import { ChevronDown } from "@untitledui/icons";
import * as tpl from "./message-templates.ts";

interface Props {
  owner: string;
  repo: string;
  prNumber: number;
  base: string;
  disabled: boolean;
  send: (text: string) => Promise<void> | void;
}

/**
 * Split-style merge action: clicking the label fires the default
 * (Squash & merge); clicking the chevron opens a dropdown with the
 * alternative strategies. Each choice sends a templated chat message.
 */
export function MergeSplitButton({
  owner,
  repo,
  prNumber,
  base,
  disabled,
  send,
}: Props) {
  const squash = () => send(tpl.mergeSquash({ owner, repo, prNumber, base }));
  const review = () => send(tpl.reviewPr({ owner, repo, prNumber }));

  return (
    <div className="inline-flex items-stretch rounded-md">
      <Button
        size="sm"
        className="rounded-r-none border-r border-primary-foreground/20"
        disabled={disabled}
        onClick={squash}
      >
        Publish
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            className="rounded-l-none px-2"
            disabled={disabled}
            aria-label="More actions"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={review}>Review</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
