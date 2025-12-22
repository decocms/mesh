import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuthConfig } from "@/web/providers/auth-config-provider";
import { authClient } from "@/web/lib/auth-client";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { cn } from "@deco/ui/lib/utils.ts";

interface UnifiedAuthFormProps {
  /**
   * URL to redirect to after successful authentication.
   * Used for OAuth flows to redirect back to the authorize endpoint.
   */
  redirectUrl?: string | null;
}

export function UnifiedAuthForm({ redirectUrl }: UnifiedAuthFormProps) {
  const { emailAndPassword } = useAuthConfig();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignUp, setIsSignUp] = useState(true);
  const [emailError, setEmailError] = useState("");

  const emailPasswordMutation = useMutation({
    mutationFn: async ({
      email,
      password,
      name,
    }: {
      email: string;
      password: string;
      name?: string;
    }) => {
      try {
        if (isSignUp) {
          const result = await authClient.signUp.email({
            email,
            password,
            name: name || "",
          });
          if (result.error) {
            throw new Error(result.error.message || "Sign up failed");
          }
          return result;
        } else {
          const result = await authClient.signIn.email({ email, password });
          if (result.error) {
            throw new Error(result.error.message || "Sign in failed");
          }
          return result;
        }
      } catch (err) {
        // Re-throw to ensure React Query catches it
        throw err instanceof Error ? err : new Error("Authentication failed");
      }
    },
    onSuccess: () => {
      // If OAuth flow, redirect to authorize endpoint to complete the flow
      if (redirectUrl) {
        window.location.href = redirectUrl;
      }
      // Otherwise, the session change will trigger React to re-render
      // and the login route will handle the redirect
    },
  });

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEmailBlur = () => {
    if (email.trim() && !validateEmail(email)) {
      setEmailError("Invalid email address");
    }
  };

  const handleEmailPassword = (e: React.FormEvent) => {
    e.preventDefault();

    // Check email validity before submitting
    if (!validateEmail(email)) {
      setEmailError("Invalid email address");
      return;
    }

    emailPasswordMutation.mutate({ email, password, name });
  };

  const handleInputChange =
    (setter: (value: string) => void) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(e.target.value);
      // Clear errors when user starts typing
      if (error) {
        emailPasswordMutation.reset();
      }
      if (setter === setEmail && emailError) {
        setEmailError("");
      }
    };

  const isLoading = emailPasswordMutation.isPending;
  const error = emailPasswordMutation.error;

  // Show button only when fields are filled
  const canSubmit = isSignUp
    ? email.trim() && password.trim() && name.trim()
    : email.trim() && password.trim();

  // Format error message
  const getErrorMessage = (error: Error | null) => {
    if (!error) return null;

    const errorMessage = error.message.toLowerCase();

    if (errorMessage.includes("unauthorized") || errorMessage.includes("401")) {
      return "Invalid email or password. Please try again.";
    }

    if (
      errorMessage.includes("already exists") ||
      errorMessage.includes("409")
    ) {
      return "An account with this email already exists. Try signing in instead.";
    }

    if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
      return "Network error. Please check your connection and try again.";
    }

    if (errorMessage.includes("rate limit") || errorMessage.includes("429")) {
      return "Too many attempts. Please wait a moment and try again.";
    }

    return error.message || "An error occurred. Please try again.";
  };

  return (
    <div className="mx-auto w-full min-w-[400px] max-w-md grid gap-6 bg-card p-10 border border-primary-foreground/20">
      {/* Logo */}
      <div className="flex justify-center">
        <img src="/logos/deco logo.svg" alt="Deco" className="h-12 w-12" />
      </div>

      {/* Header */}
      <div className="text-center space-y-1">
        <p className="text-sm text-foreground/70">
          {isSignUp ? "Create your account" : "Login or signup below"}
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive text-center">
          {getErrorMessage(error)}
        </div>
      )}

      {/* Email & Password Form */}
      {emailAndPassword.enabled && (
        <form onSubmit={handleEmailPassword} className="grid gap-4">
          <div
            className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.075,0.82,0.165,1)] ${
              isSignUp
                ? "max-h-[200px] opacity-100 translate-y-0"
                : "max-h-0 opacity-0 -translate-y-2"
            }`}
          >
            <div className={isSignUp ? "" : "pointer-events-none"}>
              <label className="block text-sm font-medium text-foreground mb-2">
                Name
              </label>
              <Input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={handleInputChange(setName)}
                required
                disabled={isLoading || !isSignUp}
                aria-hidden={!isSignUp}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Email
            </label>
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={handleInputChange(setEmail)}
              onBlur={handleEmailBlur}
              required
              disabled={isLoading}
              aria-invalid={!!emailError}
            />
            {emailError && (
              <p className="text-xs text-destructive mt-1.5">{emailError}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Password
            </label>
            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={handleInputChange(setPassword)}
              required
              disabled={isLoading}
            />
          </div>

          <div
            className={cn(
              `overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.075,0.82,0.165,1)]`,
              canSubmit
                ? "max-h-[100px] opacity-100 translate-y-0"
                : "max-h-0 opacity-0 -translate-y-2",
            )}
          >
            <div className={canSubmit ? "" : "pointer-events-none"}>
              <Button
                type="submit"
                disabled={isLoading || !canSubmit}
                className="w-full font-semibold"
                size="lg"
                aria-hidden={!canSubmit}
              >
                {isLoading
                  ? isSignUp
                    ? "Creating account..."
                    : "Signing in..."
                  : "Continue"}
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* Sign up toggle */}
      <div className="text-center">
        <Button
          type="button"
          variant="link"
          onClick={() => {
            setIsSignUp(!isSignUp);
            setName("");
            setEmailError("");
            emailPasswordMutation.reset();
          }}
          disabled={isLoading}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {isSignUp
            ? "Already have an account? Sign in"
            : "Don't have an account? Sign up"}
        </Button>
      </div>

      {/* Terms */}
      <div className="flex justify-between text-xs text-muted-foreground pt-4">
        <a
          href="https://www.decocms.com/terms-of-use"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          Terms of Service
        </a>
        <a
          href="https://www.decocms.com/privacy-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          Privacy Policy
        </a>
      </div>
    </div>
  );
}
