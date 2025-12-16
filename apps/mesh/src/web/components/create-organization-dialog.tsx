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
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

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
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const form = useForm<CreateOrgFormData>({
    defaultValues: {
      name: "",
    },
    mode: "onChange",
  });

  // Compute slug from name
  const nameValue = form.watch("name");
  const slug = slugify(nameValue || "");

  async function onSubmit(data: CreateOrgFormData) {
    setError(null);
    setIsPending(true);

    // Validate with zod
    const validation = createOrgSchema.safeParse(data);
    if (!validation.success) {
      setError(validation.error.issues[0]?.message || "Invalid form data");
      setIsPending(false);
      return;
    }

    try {
      const result = await authClient.organization.create({
        name: data.name,
        slug,
      });

      if (result?.data?.slug) {
        const orgSlug = result.data.slug;

        // Navigate to the new organization
        navigate({ to: "/$org", params: { org: orgSlug } });
        onOpenChange(false);
        form.reset();
      } else {
        throw new Error("Failed to create organization");
      }
    } catch (err) {
      setError(
        typeof err === "string"
          ? err
          : err instanceof Error
            ? err.message
            : "Failed to create organization.",
      );
    } finally {
      setIsPending(false);
    }
  }

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
            onSubmit={form.handleSubmit(onSubmit)}
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
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormDescription>
                    The name of your company or organization
                  </FormDescription>
                  {/* Slug preview */}
                  {slug && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Organization URL:{" "}
                      <span className="font-mono">
                        {typeof window !== "undefined"
                          ? globalThis.location.origin
                          : ""}
                        /{slug}
                      </span>
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            {error && (
              <div className="text-destructive text-sm mt-2">{error}</div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
              <Button
                type="submit"
                variant="default"
                disabled={!form.formState.isValid || isPending || !slug}
              >
                {isPending ? (
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
