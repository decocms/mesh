import RequiredAuthLayout from "@/web/layouts/required-auth-layout";
import { authClient } from "@/web/lib/auth-client";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deco/ui/components/card.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import { Spinner } from "@deco/ui/components/spinner.tsx";
import { KEYS } from "@/web/lib/query-keys";
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

  // Look up domain if corporate email
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

  // Auto-join existing org
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

  // Domain setup: create org + claim domain + brand extraction
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

  // Manual org creation (for generic emails)
  const createOrgMutation = useMutation({
    mutationFn: async (name: string) => {
      const slug = slugify(name);
      if (!slug) throw new Error("Invalid organization name");

      const result = await authClient.organization.create({
        name,
        slug,
      });

      if (result?.error) {
        throw new Error(
          result.error.message || "Failed to create organization",
        );
      }

      const orgSlug = result?.data?.slug ?? slug;
      window.location.href = `/${orgSlug}`;
    },
  });

  if (sessionLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const hasMatchingOrg = domainLookup?.found && domainLookup?.organization;
  const canAutoJoin = hasMatchingOrg && domainLookup?.autoJoinEnabled;

  // Corporate email, domain setup in progress
  if (domainSetupMutation.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Spinner />
            <p className="text-sm font-medium">Setting up {domainLabel}...</p>
            <p className="text-xs text-muted-foreground text-center">
              Creating your organization and extracting brand information from{" "}
              {emailDomain}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome to Mesh
          </h1>
          <p className="text-sm text-muted-foreground">
            Set up your organization to get started
          </p>
        </div>

        {domainLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <Spinner />
              <span className="ml-2 text-sm text-muted-foreground">
                Checking your email domain...
              </span>
            </CardContent>
          </Card>
        ) : canAutoJoin ? (
          /* Existing org with auto-join */
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Join {domainLookup.organization!.name}
              </CardTitle>
              <CardDescription>
                Your email ({userEmail}) matches the domain for this
                organization. You can join automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                className="w-full"
                onClick={() => joinOrgMutation.mutate()}
                disabled={joinOrgMutation.isPending}
              >
                {joinOrgMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <Spinner size="xs" /> Joining...
                  </span>
                ) : (
                  `Join ${domainLookup.organization!.name}`
                )}
              </Button>
              {joinOrgMutation.error && (
                <p className="text-sm text-destructive">
                  {joinOrgMutation.error instanceof Error
                    ? joinOrgMutation.error.message
                    : "Failed to join organization"}
                </p>
              )}
            </CardContent>
          </Card>
        ) : hasMatchingOrg ? (
          /* Org exists but auto-join disabled */
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {domainLookup.organization!.name} uses Mesh
              </CardTitle>
              <CardDescription>
                Your email domain matches this organization, but auto-join is
                not enabled. Contact an admin to get an invitation, or create
                your own organization below.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : isCorporateEmail ? (
          /* Corporate email, no org yet — offer automatic setup */
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Set up {domainLabel} on Mesh
              </CardTitle>
              <CardDescription>
                We'll create your organization and extract brand information
                from {emailDomain}. Team members with @{emailDomain} emails will
                be able to join automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                className="w-full"
                onClick={() => domainSetupMutation.mutate()}
                disabled={domainSetupMutation.isPending}
              >
                Set up {domainLabel}
              </Button>
              {domainSetupMutation.error && (
                <p className="text-sm text-destructive">
                  {domainSetupMutation.error instanceof Error
                    ? domainSetupMutation.error.message
                    : "Failed to set up organization"}
                </p>
              )}
              <div className="text-center">
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:underline"
                  onClick={() =>
                    document
                      .getElementById("create-org-section")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  Or create a custom organization
                </button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Manual org creation form — always available as fallback */}
        <Card id="create-org-section">
          <CardHeader>
            <CardTitle className="text-base">Create an organization</CardTitle>
            <CardDescription>
              {isCorporateEmail
                ? "Or set up a custom organization with a different name"
                : "Enter your organization name to get started"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (orgName.trim()) {
                  createOrgMutation.mutate(orgName.trim());
                }
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization name</Label>
                <Input
                  id="org-name"
                  placeholder={
                    isCorporateEmail ? domainLabel : "My Organization"
                  }
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  disabled={createOrgMutation.isPending}
                />
                {orgName && (
                  <p className="text-xs text-muted-foreground">
                    URL: {window.location.origin}/{slugify(orgName)}
                  </p>
                )}
              </div>

              {createOrgMutation.error && (
                <p className="text-sm text-destructive">
                  {createOrgMutation.error instanceof Error
                    ? createOrgMutation.error.message
                    : "Failed to create organization"}
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={
                  !orgName.trim() ||
                  !slugify(orgName) ||
                  createOrgMutation.isPending
                }
              >
                {createOrgMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <Spinner size="xs" /> Creating...
                  </span>
                ) : (
                  "Create Organization"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
