import RequiredAuthLayout from "@/web/layouts/required-auth-layout";
import { authClient } from "@/web/lib/auth-client";
import { KEYS } from "@/web/lib/query-keys";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  ArrowRight,
  Building02,
  CheckCircle,
  Globe04,
  Loading01,
  Palette,
  Users03,
} from "@untitledui/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";

// --- Constants ---

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

const BRAND_STEPS = [
  { icon: Building02, label: "Creating organization", delay: 0 },
  { icon: Globe04, label: "Claiming email domain", delay: 1500 },
  { icon: Users03, label: "Enabling auto-join for your team", delay: 3000 },
  { icon: Palette, label: "Extracting brand context", delay: 4500 },
];

// --- Helpers ---

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]+/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// --- Types ---

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

// --- Entry ---

export default function OnboardingRoute() {
  return (
    <RequiredAuthLayout>
      <OnboardingPage />
    </RequiredAuthLayout>
  );
}

// --- Main page ---

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
      <div className="flex min-h-screen items-center justify-center">
        <Loading01 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasMatchingOrg = domainLookup?.found && domainLookup?.organization;
  const canAutoJoin = hasMatchingOrg && domainLookup?.autoJoinEnabled;

  // Animated workflow during domain setup
  if (domainSetupMutation.isPending) {
    return <SetupWorkflow domainLabel={domainLabel} domain={emailDomain} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Get started
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
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
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 px-4 py-3">
              <p className="text-sm font-medium text-foreground">
                {domainLookup.organization!.name}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
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
                <>
                  Join {domainLookup.organization!.name}
                  <ArrowRight size={16} className="ml-2" />
                </>
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
          <div className="rounded-lg border border-border/60 px-4 py-3">
            <p className="text-sm font-medium text-foreground">
              {domainLookup.organization!.name}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Your email domain matches this organization, but auto-join is not
              enabled. Contact an admin for an invitation.
            </p>
          </div>
        ) : isCorporateEmail ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 px-4 py-3">
              <p className="text-sm font-medium text-foreground">
                Set up {domainLabel}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Create your organization and claim {emailDomain}. Team members
                with matching emails will be able to join automatically.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => domainSetupMutation.mutate()}
            >
              Set up {domainLabel}
              <ArrowRight size={16} className="ml-2" />
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

        {/* Manual creation — generic email flow */}
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (orgName.trim()) {
              createOrgMutation.mutate(orgName.trim());
            }
          }}
        >
          {!isCorporateEmail && (
            <div>
              <h2 className="text-lg font-medium text-foreground">
                What's your company?
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                We couldn't detect your company from your email. Tell us your
                organization name and we'll set things up.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Input
              placeholder={isCorporateEmail ? domainLabel : "Organization name"}
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
            variant={isCorporateEmail ? "outline" : "default"}
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
              <>
                Create workspace
                <ArrowRight size={16} className="ml-2" />
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Setup Workflow — animated step progression with brand context preview
// ============================================================================

function SetupWorkflow({
  domainLabel,
  domain,
}: {
  domainLabel: string;
  domain: string;
}) {
  const [activeStep, setActiveStep] = useState(0);
  const didSchedule = useRef(false);

  if (!didSchedule.current) {
    didSchedule.current = true;
    for (let i = 1; i < BRAND_STEPS.length; i++) {
      setTimeout(() => setActiveStep(i), BRAND_STEPS[i]!.delay);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Setting up {domainLabel}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Getting everything ready from {domain}
          </p>
        </div>

        <div className="space-y-4">
          {BRAND_STEPS.map((step, i) => {
            const Icon = step.icon;
            const isActive = i === activeStep;
            const isDone = i < activeStep;
            const isPending = i > activeStep;

            return (
              <div
                key={step.label}
                className={cn(
                  "flex items-center gap-3 transition-opacity duration-500",
                  isPending ? "opacity-30" : "opacity-100",
                )}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  {isDone ? (
                    <CheckCircle
                      size={16}
                      className="text-primary transition-colors duration-300"
                    />
                  ) : isActive ? (
                    <Loading01
                      size={16}
                      className="animate-spin text-primary"
                    />
                  ) : (
                    <Icon size={16} className="text-muted-foreground" />
                  )}
                </div>
                <span
                  className={cn(
                    "text-sm transition-colors duration-300",
                    isActive
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
