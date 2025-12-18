import { authClient } from "@/web/lib/auth-client";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@deco/ui/components/alert-dialog.tsx";
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
import { Spinner } from "@deco/ui/components/spinner.tsx";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";

// Simple slugify function for client-side use
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]+/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const createOrgSchema = z.object({
  name: z.string().min(2, "Organization name is required"),
});

type CreateOrgFormData = z.infer<typeof createOrgSchema>;

interface CreateOrganizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateOrganizationDialog({
  open,
  onOpenChange,
}: CreateOrganizationDialogProps) {
  const navigate = useNavigate();

  const form = useForm<CreateOrgFormData>({
    resolver: zodResolver(createOrgSchema),
    defaultValues: { name: "" },
  });

  const createOrgMutation = useMutation({
    mutationFn: async (data: CreateOrgFormData) => {
      const computedSlug = slugify(data.name);
      if (!computedSlug) {
        throw new Error("Organization slug is invalid");
      }

      const result = await authClient.organization.create({
        name: data.name,
        slug: computedSlug,
      });

      if (result?.error) {
        throw new Error(
          result.error.message || "Failed to create organization",
        );
      }

      const orgSlug = result?.data?.slug ?? computedSlug;
      if (!orgSlug) {
        throw new Error("Failed to create organization");
      }

      return { orgSlug };
    },
    onSuccess: ({ orgSlug }) => {
      navigate({ to: "/$org", params: { org: orgSlug } });
    },
  });

  const errorMessage =
    createOrgMutation.error instanceof Error
      ? createOrgMutation.error.message
      : createOrgMutation.error
        ? "Failed to create organization."
        : null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Create a new organization</AlertDialogTitle>
          <AlertDialogDescription>
            Set up a new organization to collaborate with others.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Form {...form}>
          <form
            className="space-y-6"
            onSubmit={form.handleSubmit((data) =>
              createOrgMutation.mutateAsync(data),
            )}
            autoComplete="off"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organization Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Acme Inc."
                      disabled={form.formState.isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>
                    The name of your company or organization
                  </FormDescription>
                  {/* Slug preview */}
                  {field.value && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Organization URL:{" "}
                      <span className="font-mono">
                        {typeof window !== "undefined"
                          ? globalThis.location.origin
                          : ""}
                        /{slugify(field.value)}
                      </span>
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            {errorMessage && (
              <div className="text-destructive text-sm mt-2">
                {errorMessage}
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={form.formState.isSubmitting}
                onClick={() => {
                  createOrgMutation.reset();
                  form.reset();
                }}
              >
                Cancel
              </AlertDialogCancel>
              <Button
                type="submit"
                variant="default"
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
              >
                {form.formState.isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <Spinner size="xs" /> Creating...
                  </span>
                ) : (
                  "Create Organization"
                )}
              </Button>
            </AlertDialogFooter>
          </form>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
