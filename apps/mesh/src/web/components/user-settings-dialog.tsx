import { Avatar } from "@deco/ui/components/avatar.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@deco/ui/components/form.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Switch } from "@deco/ui/components/switch.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { Check, Code01, Copy01, Upload01, X } from "@untitledui/icons";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useDeveloperMode } from "@/web/hooks/use-developer-mode.ts";
import { toast } from "sonner";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KEYS } from "@/web/lib/query-keys.ts";

interface UserSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { id: string; name?: string | null; email: string };
  userImage?: string;
}

const userSettingsSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  email: z.string().email("Invalid email address"),
  image: z.string().optional(),
  developerMode: z.boolean(),
});

type UserSettingsFormValues = z.infer<typeof userSettingsSchema>;

function AvatarUpload({
  value,
  onChange,
  name,
}: {
  value?: string | null;
  onChange: (value: string) => void;
  name?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Check file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        toast.error("Image must be smaller than 2MB");
        return;
      }

      const reader = new FileReader();

      reader.onerror = () => {
        const error = reader.error;
        console.error("FileReader error:", error);
        toast.error(
          error?.message || "Failed to read image file. Please try again.",
        );
        // Clear the file input so user can retry with the same file
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      };

      reader.onloadend = () => {
        // Only call onChange if the read was successful (result is a valid data URL)
        if (reader.readyState === FileReader.DONE && reader.result) {
          const result = reader.result as string;
          onChange(result);
        }
      };

      reader.readAsDataURL(file);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
  };

  return (
    <div className="flex items-start gap-4">
      <div className="relative group inline-block">
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          onChange={handleFileChange}
        />

        <Avatar
          url={value || undefined}
          fallback={name || "U"}
          shape="circle"
          size="xl"
          className="h-20 w-20"
        />

        <button
          type="button"
          onClick={handleClick}
          className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
          aria-label="Upload avatar"
        >
          <Upload01 className="h-6 w-6 text-white" />
        </button>

        {value && (
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10"
            aria-label="Remove avatar"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="flex-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClick}
          className="mb-2"
        >
          {value ? "Change Avatar" : "Upload Avatar"}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            className="ml-2"
          >
            Remove
          </Button>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          Recommended: Square image, at least 200x200px. Max 2MB.
        </p>
      </div>
    </div>
  );
}

export function UserSettingsDialog({
  open,
  onOpenChange,
  user,
  userImage,
}: UserSettingsDialogProps) {
  const [developerMode, setDeveloperMode] = useDeveloperMode();
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<UserSettingsFormValues>({
    resolver: zodResolver(userSettingsSchema),
    values: {
      name: user.name || "",
      email: user.email,
      image: userImage || "",
      developerMode,
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: UserSettingsFormValues) => {
      const response = await fetch("/api/auth/custom/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: data.name,
          image: data.image || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update profile");
      }

      return response.json();
    },
    onSuccess: (_, data) => {
      // Update developer mode (local storage)
      setDeveloperMode(data.developerMode);

      // Invalidate session query to refresh user data
      queryClient.invalidateQueries({
        queryKey: KEYS.session(),
      });

      toast.success("Profile updated successfully");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to update profile",
      );
    },
  });

  const handleCopyUserId = () => {
    navigator.clipboard.writeText(user.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const onSubmit = (data: UserSettingsFormValues) => {
    updateUserMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 flex flex-col h-[600px]">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle>Profile Settings</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
          <div className="flex-1 overflow-auto">
            <div className="p-5 max-w-2xl">
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-6"
                >
                  <FormField
                    control={form.control}
                    name="image"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <AvatarUpload
                            value={field.value}
                            onChange={field.onChange}
                            name={form.watch("name")}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Your name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <Input
                                    type="email"
                                    placeholder="your.email@example.com"
                                    {...field}
                                    disabled
                                  />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p className="text-xs">
                                  Email cannot be changed
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="developerMode"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between gap-4 p-4 rounded-lg border border-border">
                        <div className="flex flex-col gap-1 flex-1 min-w-0">
                          <FormLabel className="text-sm font-medium text-foreground flex items-center gap-2">
                            <Code01
                              size={16}
                              className="text-muted-foreground"
                            />
                            Developer Mode
                          </FormLabel>
                          <FormDescription className="text-xs text-muted-foreground">
                            Show technical details like JSON input/output for
                            tool calls
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </form>
              </Form>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border px-5 py-5 flex items-center justify-between gap-2.5 shrink-0">
            <div className="group flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono text-xs">{user.id}</span>
              <button
                type="button"
                onClick={handleCopyUserId}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-accent rounded"
                aria-label="Copy user ID"
              >
                {copied ? (
                  <Check size={14} className="text-green-600" />
                ) : (
                  <Copy01 size={14} />
                )}
              </button>
            </div>
            <div className="flex items-center gap-2.5">
              <Button
                variant="outline"
                onClick={() => {
                  form.reset();
                  onOpenChange(false);
                }}
                disabled={updateUserMutation.isPending}
                className="h-10"
              >
                Cancel
              </Button>
              <Button
                onClick={form.handleSubmit(onSubmit)}
                disabled={
                  !form.formState.isDirty || updateUserMutation.isPending
                }
                className="h-10"
              >
                {updateUserMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
