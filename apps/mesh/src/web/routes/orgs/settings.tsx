import { CollectionHeader } from "@/web/components/collections/collection-header.tsx";
import { CollectionPage } from "@/web/components/collections/collection-page.tsx";
import { authClient } from "@/web/lib/auth-client";
import { KEYS } from "@/web/lib/query-keys";
import { useProjectContext } from "@decocms/mesh-sdk";
import { Button } from "@deco/ui/components/button.tsx";
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
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, LayersTwo01, Upload01, X } from "@untitledui/icons";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const organizationSettingsSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(50, "Slug is too long")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug must contain only lowercase letters, numbers, and hyphens",
    ),
  logo: z.string().optional(),
});

type OrganizationSettingsFormValues = z.infer<
  typeof organizationSettingsSchema
>;

function LogoUpload({
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
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleFileChange}
      />

      {value ? (
        <div className="relative group">
          <div className="h-20 w-20 rounded-lg border border-border bg-muted/20 overflow-hidden">
            <img
              src={value}
              alt={name || "Organization logo"}
              className="w-full h-full object-cover"
            />
          </div>
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className="h-20 w-20 rounded-lg border-2 border-dashed border-border hover:border-foreground/50 hover:bg-accent/50 transition-colors flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <Upload01 className="h-5 w-5" />
          <span className="text-xs">Upload</span>
        </button>
      )}

      <div className="flex-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClick}
          className="mb-2"
        >
          {value ? "Change Logo" : "Upload Logo"}
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

export default function OrgSettings() {
  const navigate = useNavigate();
  const { org } = useProjectContext();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<OrganizationSettingsFormValues>({
    resolver: zodResolver(organizationSettingsSchema),
    values: {
      name: org.name ?? "",
      slug: org.slug ?? "",
      logo: org.logo ?? "",
    },
  });

  const updateOrgMutation = useMutation({
    mutationFn: async (data: OrganizationSettingsFormValues) => {
      const updateData: Record<string, unknown> = {
        name: data.name,
        slug: data.slug,
      };

      // Include logo if it has a value (Better Auth expects string or undefined, not null)
      if (data.logo) {
        updateData.logo = data.logo;
      }

      const result = await authClient.organization.update({
        organizationId: org.id,
        data: updateData,
      });

      if (result?.error) {
        throw new Error(
          result.error.message || "Failed to update organization",
        );
      }

      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: KEYS.organizations() });
      queryClient.invalidateQueries({
        queryKey: KEYS.activeOrganization(org.slug),
      });
      toast.success("Organization settings updated successfully");

      // If slug changed, navigate to new slug
      if (data?.data?.slug && data.data.slug !== org.slug) {
        navigate({
          to: "/$org/settings",
          params: { org: data.data.slug },
        });
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update organization",
      );
    },
    onSettled: () => {
      setIsSaving(false);
    },
  });

  const onSubmit = (data: OrganizationSettingsFormValues) => {
    setIsSaving(true);
    updateOrgMutation.mutate(data);
  };

  const hasChanges = form.formState.isDirty;

  return (
    <CollectionPage>
      <CollectionHeader title="Settings" />

      <div className="flex-1 overflow-auto">
        <div className="flex h-full">
          {/* Content */}
          <div className="flex-1 overflow-auto">
            <div className="p-5 max-w-2xl">
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Organization
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Update your organization's name, slug, and logo.
                  </p>
                </div>

                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-6"
                  >
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Organization Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="My Organization"
                              {...field}
                              disabled={isSaving}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="slug"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Organization Slug</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="my-organization"
                              {...field}
                              disabled={isSaving}
                              onChange={(e) => {
                                // Convert to lowercase and remove invalid chars
                                const sanitized = e.target.value
                                  .toLowerCase()
                                  .replace(/[^a-z0-9-]/g, "");
                                field.onChange(sanitized);
                              }}
                            />
                          </FormControl>
                          <FormDescription>
                            Used in URLs. Only lowercase letters, numbers, and
                            hyphens are allowed.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="logo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Logo</FormLabel>
                          <FormControl>
                            <LogoUpload
                              value={field.value}
                              onChange={field.onChange}
                              name={form.watch("name")}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex items-center gap-3 pt-4">
                      <Button
                        type="submit"
                        disabled={!hasChanges || isSaving}
                        className="min-w-24"
                      >
                        {isSaving ? "Saving..." : "Save Changes"}
                      </Button>
                      {hasChanges && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => form.reset()}
                          disabled={isSaving}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </form>
                </Form>

                <div className="border-t border-border pt-6 mt-6">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">
                      More Settings
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Additional configuration options for your organization.
                    </p>
                  </div>

                  <div className="mt-4">
                    <Link
                      to="/$org/settings/plugins"
                      params={{ org: org.slug }}
                      className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <LayersTwo01 className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <div className="font-medium text-foreground">
                            Plugins
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Enable or disable plugins for your organization
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </CollectionPage>
  );
}
