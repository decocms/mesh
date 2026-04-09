import RequiredAuthLayout from "@/web/layouts/required-auth-layout";
import { authClient } from "@/web/lib/auth-client";
import { KEYS } from "@/web/lib/query-keys";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import { Loading01 } from "@untitledui/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "yahoo.co.uk",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "zoho.com",
  "yandex.com",
  "mail.com",
  "gmx.com",
  "gmx.net",
  "tutanota.com",
  "fastmail.com",
]);

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]+/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface DomainLookupResult {
  found: boolean;
  autoJoinEnabled?: boolean;
  organization?: { name: string; slug: string } | null;
}

interface DomainSetupResult {
  success: boolean;
  slug?: string;
  brandExtracted?: boolean;
  alreadyExists?: boolean;
  error?: string;
}

export default function OnboardingRoute() {
  return (
    <RequiredAuthLayout>
      <OnboardingPage />
    </RequiredAuthLayout>
  );
}

function OnboardingPage() {
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const [orgName, setOrgName] = useState("");

  const userEmail = session?.user?.email ?? "";
  const emailDomain = userEmail.split("@")[1]?.toLowerCase() ?? "";
  const isCorporateEmail =
    emailDomain && !GENERIC_EMAIL_DOMAINS.has(emailDomain);
  const domainLabel =
    emailDomain.split(".")[0]?.charAt(0).toUpperCase() +
    (emailDomain.split(".")[0]?.slice(1) ?? "");

  const { data: domainLookup, isLoading: domainLoading } =
    useQuery<DomainLookupResult>({
      queryKey: KEYS.domainLookup(emailDomain),
      queryFn: async () => {
        const res = await fetch("/api/auth/custom/domain-lookup", {
          credentials: "include",
        });
        return res.json();
      },
      enabled: !!isCorporateEmail,
    });

  const joinOrgMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/custom/domain-join", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to join organization");
      }
      window.location.href = `/${data.slug}`;
    },
  });

  const domainSetupMutation = useMutation({
    mutationFn: async (): Promise<DomainSetupResult> => {
      const res = await fetch("/api/auth/custom/domain-setup", {
        method: "POST",
        credentials: "include",
      });
      const data: DomainSetupResult = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to set up organization");
      }
      return data;
    },
    onSuccess: (data) => {
      if (data.slug) {
        window.location.href = `/${data.slug}`;
      }
    },
  });

  const createOrgMutation = useMutation({
    mutationFn: async (name: string) => {
      const slug = slugify(name);
      if (!slug) throw new Error("Invalid organization name");

      const result = await authClient.organization.create({ name, slug });
      if (result?.error) {
        throw new Error(
          result.error.message || "Failed to create organization",
        );
      }
      window.location.href = `/${result?.data?.slug ?? slug}`;
    },
  });

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loading01 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasMatchingOrg = domainLookup?.found && domainLookup?.organization;
  const canAutoJoin = hasMatchingOrg && domainLookup?.autoJoinEnabled;

  // Full-screen loading during domain setup
  if (domainSetupMutation.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loading01 size={20} className="animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Setting up {domainLabel}...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-lg font-medium">Get started</h1>
          <p className="text-sm text-muted-foreground">
            Create or join an organization to start using Studio.
          </p>
        </div>

        {domainLoading ? (
          <div className="flex items-center gap-2 py-4">
            <Loading01
              size={14}
              className="animate-spin text-muted-foreground"
            />
            <span className="text-sm text-muted-foreground">
              Checking {emailDomain}...
            </span>
          </div>
        ) : canAutoJoin ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {domainLookup.organization!.name}
              </p>
              <p className="text-xs text-muted-foreground">
                Your email matches this organization. Join to get started.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => joinOrgMutation.mutate()}
              disabled={joinOrgMutation.isPending}
            >
              {joinOrgMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <Loading01 size={14} className="animate-spin" /> Joining...
                </span>
              ) : (
                `Join ${domainLookup.organization!.name}`
              )}
            </Button>
            {joinOrgMutation.error && (
              <p className="text-xs text-destructive">
                {joinOrgMutation.error instanceof Error
                  ? joinOrgMutation.error.message
                  : "Failed to join organization"}
              </p>
            )}
          </div>
        ) : hasMatchingOrg ? (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">
              {domainLookup.organization!.name}
            </p>
            <p className="text-xs text-muted-foreground">
              Your email domain matches this organization, but auto-join is not
              enabled. Contact an admin for an invitation.
            </p>
          </div>
        ) : isCorporateEmail ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Set up {domainLabel}</p>
              <p className="text-xs text-muted-foreground">
                Create your organization and claim {emailDomain}. Team members
                with matching emails will be able to join automatically.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => domainSetupMutation.mutate()}
            >
              Set up {domainLabel}
            </Button>
            {domainSetupMutation.error && (
              <p className="text-xs text-destructive">
                {domainSetupMutation.error instanceof Error
                  ? domainSetupMutation.error.message
                  : "Failed to set up organization"}
              </p>
            )}
          </div>
        ) : null}

        {/* Separator when there's a corporate option above */}
        {isCorporateEmail && (
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        )}

        {/* Manual creation */}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (orgName.trim()) {
              createOrgMutation.mutate(orgName.trim());
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="org-name" className="text-xs text-muted-foreground">
              Organization name
            </Label>
            <Input
              id="org-name"
              placeholder={isCorporateEmail ? domainLabel : "My Organization"}
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              disabled={createOrgMutation.isPending}
            />
            {orgName && (
              <p className="text-xs text-muted-foreground">
                {window.location.origin}/{slugify(orgName)}
              </p>
            )}
          </div>

          {createOrgMutation.error && (
            <p className="text-xs text-destructive">
              {createOrgMutation.error instanceof Error
                ? createOrgMutation.error.message
                : "Failed to create organization"}
            </p>
          )}

          <Button
            type="submit"
            variant="outline"
            className="w-full"
            disabled={
              !orgName.trim() ||
              !slugify(orgName) ||
              createOrgMutation.isPending
            }
          >
            {createOrgMutation.isPending ? (
              <span className="flex items-center gap-2">
                <Loading01 size={14} className="animate-spin" /> Creating...
              </span>
            ) : (
              "Create Organization"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
