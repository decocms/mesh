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

export default function OnboardingPage() {
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const [orgName, setOrgName] = useState("");

  const userEmail = session?.user?.email ?? "";
  const emailDomain = userEmail.split("@")[1]?.toLowerCase() ?? "";
  const isCorporateEmail =
    emailDomain && !GENERIC_EMAIL_DOMAINS.has(emailDomain);

  // Look up domain if corporate email
  const { data: domainLookup, isPending: domainLoading } =
    useQuery<DomainLookupResult>({
      queryKey: KEYS.domainLookup(emailDomain),
      queryFn: async () => {
        const res = await fetch(
          `/api/auth/custom/domain-lookup?domain=${encodeURIComponent(emailDomain)}`,
        );
        return res.json();
      },
      enabled: !!isCorporateEmail,
    });

  // Auto-join mutation — calls server-side endpoint that verifies
  // domain ownership + auto_join_enabled before adding the user as member
  const joinOrgMutation = useMutation({
    mutationFn: async (orgSlug: string) => {
      const res = await fetch("/api/auth/custom/domain-join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orgSlug }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to join organization");
      }
      window.location.href = `/${orgSlug}`;
    },
  });

  // Create org mutation
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

  const isLoading = domainLoading;
  const hasMatchingOrg = domainLookup?.found && domainLookup?.organization;
  const canAutoJoin = hasMatchingOrg && domainLookup?.autoJoinEnabled;

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

        {isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <Spinner />
              <span className="ml-2 text-sm text-muted-foreground">
                Checking your email domain...
              </span>
            </CardContent>
          </Card>
        ) : canAutoJoin ? (
          /* Auto-join available */
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
                onClick={() =>
                  joinOrgMutation.mutate(domainLookup.organization!.slug)
                }
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
                  Or create your own organization
                </button>
              </div>
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
        ) : null}

        {/* Create organization form */}
        <Card id="create-org-section">
          <CardHeader>
            <CardTitle className="text-base">Create an organization</CardTitle>
            <CardDescription>
              {isCorporateEmail
                ? `Create a new organization for ${emailDomain}`
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
                    isCorporateEmail
                      ? emailDomain.split(".")[0]?.charAt(0).toUpperCase() +
                        (emailDomain.split(".")[0]?.slice(1) ?? "")
                      : "My Organization"
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
