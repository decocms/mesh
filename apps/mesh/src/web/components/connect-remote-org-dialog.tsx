import { useState } from "react";
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
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Eye, EyeOff } from "@untitledui/icons";

const connectSchema = z.object({
  remoteUrl: z.string().url("Must be a valid URL"),
  apiKey: z.string().min(1, "API key is required"),
});

type ConnectFormData = z.infer<typeof connectSchema>;

interface ConnectRemoteOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectRemoteOrgDialog({
  open,
  onOpenChange,
}: ConnectRemoteOrgDialogProps) {
  const [showKey, setShowKey] = useState(false);

  const form = useForm<ConnectFormData>({
    resolver: zodResolver(connectSchema),
    defaultValues: {
      remoteUrl: "https://studio.decocms.com",
      apiKey: "",
    },
  });

  const connectMutation = useMutation({
    mutationFn: async (data: ConnectFormData) => {
      const response = await fetch("/api/remote-org/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error ?? `Connection failed (${response.status})`,
        );
      }

      return response.json() as Promise<{
        orgSlug: string;
        orgId: string;
        orgName: string;
        connectionCount: number;
      }>;
    },
    onSuccess: ({ orgSlug }) => {
      window.location.href = `/${orgSlug}`;
    },
  });

  const errorMessage =
    connectMutation.error instanceof Error
      ? connectMutation.error.message
      : connectMutation.error
        ? "Failed to connect to remote organization."
        : null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Connect remote organization</AlertDialogTitle>
          <AlertDialogDescription>
            Connect to an organization on a remote Deco Studio instance. You'll
            need an API key from that studio.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Form {...form}>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((data) =>
              connectMutation.mutateAsync(data),
            )}
            autoComplete="off"
          >
            <FormField
              control={form.control}
              name="remoteUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Studio URL</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="https://studio.decocms.com"
                      disabled={form.formState.isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>
                    The URL of the remote Deco Studio instance
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API Key</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        type={showKey ? "text" : "password"}
                        placeholder="deco_..."
                        disabled={form.formState.isSubmitting}
                        className="pr-8"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </FormControl>
                  <FormDescription>
                    Create an API key in the remote studio's Settings
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {errorMessage && (
              <div className="text-destructive text-sm">{errorMessage}</div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={form.formState.isSubmitting}
                onClick={() => {
                  connectMutation.reset();
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
                    <Spinner size="xs" /> Connecting...
                  </span>
                ) : (
                  "Connect"
                )}
              </Button>
            </AlertDialogFooter>
          </form>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
