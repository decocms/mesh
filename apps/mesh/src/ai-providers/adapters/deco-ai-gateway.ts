import type { OAuthPkceResult, ProviderAdapter } from "../types";
import { openrouterAdapter } from "./openrouter";
import { getSettings } from "../../settings";

function getBase(): string {
  return getSettings().aiGatewayUrl ?? "https://ai-site.decocache.com";
}

export const decoAiGatewayAdapter: ProviderAdapter = {
  info: {
    id: "deco",
    name: "Deco AI Gateway",
    description: "Deco-managed keys with access to 100+ models",
    logo: "/logos/deco logo.svg",
  },

  supportedMethods: ["oauth-pkce", "api-key"],

  getOAuthUrl({
    callbackUrl,
    codeChallenge,
    codeChallengeMethod,
    organizationId,
  }: {
    callbackUrl: string;
    codeChallenge: string;
    codeChallengeMethod: "S256";
    organizationId: string;
  }) {
    const params = new URLSearchParams({
      redirect_uri: callbackUrl,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      organization_id: organizationId,
    });
    return `${getBase()}/oauth/authorize?${params}`;
  },

  async exchangeOAuthCode({ code, codeVerifier }): Promise<OAuthPkceResult> {
    const res = await fetch(`${getBase()}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`Deco AI Gateway OAuth exchange failed: ${res.status}`);
    }
    const data = await res.json();
    return { apiKey: data.key };
  },

  async getTopUpUrl(
    apiKey: string,
    amountCents: number,
    currency: "usd" | "brl" = "usd",
  ) {
    const res = await fetch(`${getBase()}/api/credits/topup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ amountCents, currency }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Failed to create top-up checkout: ${res.status}`);
    }
    const data = (await res.json()) as { url: string };
    return data.url;
  },

  async getCreditsBalance(meshJwt: string, organizationId: string) {
    const res = await fetch(
      `${getBase()}/api/teams/${organizationId}/balance`,
      {
        headers: { Authorization: `Bearer ${meshJwt}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) {
      throw new Error(`Failed to fetch credits balance: ${res.status}`);
    }
    const data = (await res.json()) as { balance_cents: number };
    return { balanceCents: data.balance_cents };
  },

  async provisionKey(meshJwt: string, organizationId: string) {
    const studioProvisionSecretKey =
      getSettings().studioProvisionSecretKey ?? "";
    if (!studioProvisionSecretKey) {
      throw new Error("STUDIO_PROVISION_SECRET_KEY is not set");
    }
    const res = await fetch(`${getBase()}/api/keys/provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Provision-Key": studioProvisionSecretKey,
        Authorization: `Bearer ${meshJwt}`,
      },
      body: JSON.stringify({ organization_id: organizationId }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`Deco AI Gateway key provisioning failed: ${res.status}`);
    }
    const data = (await res.json()) as { key: string };
    return data.key;
  },

  create(apiKey) {
    const base = openrouterAdapter.create(apiKey);
    return { ...base, info: this.info };
  },
};
