import { UNKNOWN_CONNECTION_ID, createToolCaller } from "@/tools/client";
import { ToolSetSelector } from "@/web/components/tool-set-selector.tsx";
import { useCollectionItem } from "@/web/hooks/use-collections";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Loading01 } from "@untitledui/icons";
import { Input } from "@deco/ui/components/input.tsx";
import { Spinner } from "@deco/ui/components/spinner.tsx";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { AgentSchema } from "@decocms/bindings/agent";
import { useParams } from "@tanstack/react-router";
import { InfoCircle, Upload01 } from "@untitledui/icons";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PinToSidebarButton } from "../pin-to-sidebar-button";
import { ViewActions, ViewLayout, ViewTabs } from "./layout";

export type Agent = z.infer<typeof AgentSchema>;

export interface AgentDetailsViewProps {
  itemId: string;
  onBack: () => void;
  onUpdate: (updates: Record<string, unknown>) => Promise<void>;
}

function SmartAvatarUpload({
  value,
  onChange,
  alt,
}: {
  value?: string | null;
  onChange: (value: string) => void;
  alt?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        onChange(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      className="relative h-14 w-14 shrink-0 cursor-pointer group"
      onClick={handleClick}
    >
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleFileChange}
      />

      <div className="h-full w-full rounded-xl border border-border bg-muted/20 overflow-hidden relative">
        {value ? (
          <img
            src={value}
            alt={alt || "Avatar"}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl">
            🤖
          </div>
        )}

        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
          <Upload01 className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  );
}

type TabId = "profile" | "tools" | "triggers" | "advanced";

export function AgentDetailsView({
  itemId,
  onBack,
  onUpdate,
}: AgentDetailsViewProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  const { connectionId } = useParams({
    from: "/shell/$org/mcps/$connectionId/$collectionName/$itemId",
  });

  const safeConnectionId = connectionId ?? UNKNOWN_CONNECTION_ID;
  const toolCaller = createToolCaller(safeConnectionId);

  const item = useCollectionItem<Agent>(
    safeConnectionId,
    "AGENT",
    itemId,
    toolCaller,
  );

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { isDirty },
  } = useForm<Agent>({
    defaultValues: {
      title: "",
      description: "",
      instructions: "",
      avatar: "",
      tool_set: {},
    },
  });

  const avatarValue = watch("avatar");
  const toolSet = watch("tool_set") ?? {};

  // Reset form when item changes (e.g. first load)
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (item) {
      reset({
        title: item.title ?? "",
        description: item.description ?? "",
        instructions: item.instructions ?? "",
        avatar: item.avatar ?? "",
        tool_set: item.tool_set ?? {},
      });
    }
  }, [item, reset]);

  const onSubmit = async (data: Agent) => {
    setIsSaving(true);
    try {
      await onUpdate(data);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToolSetChange = (newToolSet: Record<string, string[]>) => {
    setValue("tool_set", newToolSet, { shouldDirty: true });
  };

  if (!item) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <ViewLayout onBack={onBack}>
      <ViewTabs>
        <Button
          variant={activeTab === "profile" ? "secondary" : "ghost"}
          size="sm"
          className={cn(
            "h-7 font-normal",
            activeTab === "profile"
              ? "bg-muted text-foreground"
              : "text-muted-foreground",
          )}
          onClick={() => setActiveTab("profile")}
        >
          Profile
        </Button>
        <Button
          variant={activeTab === "tools" ? "secondary" : "ghost"}
          size="sm"
          className={cn(
            "h-7 font-normal",
            activeTab === "tools"
              ? "bg-muted text-foreground"
              : "text-muted-foreground",
          )}
          onClick={() => setActiveTab("tools")}
        >
          Tools
        </Button>
        <Button
          variant={activeTab === "triggers" ? "secondary" : "ghost"}
          size="sm"
          className={cn(
            "h-7 font-normal",
            activeTab === "triggers"
              ? "bg-muted text-foreground"
              : "text-muted-foreground",
          )}
          onClick={() => setActiveTab("triggers")}
          disabled={true}
        >
          Triggers
        </Button>
        <Button
          variant={activeTab === "advanced" ? "secondary" : "ghost"}
          size="sm"
          className={cn(
            "h-7 font-normal",
            activeTab === "advanced"
              ? "bg-muted text-foreground"
              : "text-muted-foreground",
          )}
          onClick={() => setActiveTab("advanced")}
          disabled={true}
        >
          Advanced
        </Button>
      </ViewTabs>

      <ViewActions>
        <PinToSidebarButton
          connectionId={connectionId}
          title={item.title}
          icon={item.avatar ?? "smart_toy"}
        />
        <Button
          className="bg-[#d0ec1a] text-[#07401a] hover:bg-[#d0ec1a]/90 h-7 text-xs font-medium"
          onClick={handleSubmit(onSubmit)}
          disabled={!isDirty || isSaving}
        >
          {isSaving ? (
            <>
              <Loading01 size={12} className="mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </ViewActions>

      {/* Main Content */}
      {activeTab === "profile" && (
        <div className="p-5">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Agent Identity Header */}
            <div className="flex gap-4 items-start">
              <SmartAvatarUpload
                value={avatarValue}
                onChange={(val) =>
                  setValue("avatar", val, { shouldDirty: true })
                }
                alt={watch("title")}
              />
              <div className="space-y-3 pt-1 flex-1">
                <Input
                  {...register("title")}
                  className="text-2xl font-medium text-foreground border-transparent hover:border-input focus:border-input px-0 h-auto bg-transparent shadow-none"
                  placeholder="Agent Name"
                />
                <Input
                  {...register("description")}
                  className="text-sm text-muted-foreground border-transparent hover:border-input focus:border-input px-0 h-auto bg-transparent shadow-none"
                  placeholder="Brief description"
                />
              </div>
            </div>

            {/* Instructions Section */}
            <div className="space-y-4">
              <Badge
                variant="secondary"
                className="px-2 py-0.5 h-6 gap-1.5 bg-secondary/50 text-muted-foreground font-normal text-xs hover:bg-secondary/50"
              >
                <InfoCircle className="h-3.5 w-3.5" />
                Type @ to add tools and more
              </Badge>

              <div className="relative">
                <Textarea
                  {...register("instructions")}
                  className="min-h-[400px] resize-none text-sm leading-relaxed font-normal border-0 focus-visible:ring-0 px-0 py-0 shadow-none"
                  placeholder="Enter agent instructions..."
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "tools" && (
        <ToolSetSelector
          toolSet={toolSet}
          onToolSetChange={handleToolSetChange}
        />
      )}

      {activeTab === "triggers" && (
        <div className="p-5">
          <div className="text-sm text-muted-foreground">
            Triggers tab coming soon
          </div>
        </div>
      )}

      {activeTab === "advanced" && (
        <div className="p-5">
          <div className="text-sm text-muted-foreground">
            Advanced tab coming soon
          </div>
        </div>
      )}
    </ViewLayout>
  );
}
