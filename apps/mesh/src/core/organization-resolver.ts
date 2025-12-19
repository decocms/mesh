/**
 * Organization Resolver
 *
 * Centraliza a lógica de resolução de organizações para contextos OAuth
 * Evita mutação direta do contexto e duplicação de código
 */

import type { Kysely } from "kysely";
import type { Database } from "../storage/types";

export interface OrganizationContext {
  id: string;
  slug?: string;
  name?: string;
}

export interface UserRoleInfo {
  role: string;
  organizationId: string;
}

/**
 * Busca informações da organização pelo ID
 */
export async function fetchOrganization(
  db: Kysely<Database>,
  organizationId: string,
): Promise<OrganizationContext | null> {
  const orgData = await db
    .selectFrom("organization")
    .select(["id", "slug", "name"])
    .where("id", "=", organizationId)
    .executeTakeFirst();

  if (!orgData) {
    return null;
  }

  return {
    id: orgData.id,
    slug: orgData.slug,
    name: orgData.name,
  };
}

/**
 * Busca o role do usuário em uma organização específica
 */
export async function fetchUserRole(
  db: Kysely<Database>,
  userId: string,
  organizationId: string,
): Promise<string | null> {
  const membership = await db
    .selectFrom("member")
    .select(["role"])
    .where("userId", "=", userId)
    .where("organizationId", "=", organizationId)
    .executeTakeFirst();

  return membership?.role ?? null;
}

/**
 * Resolve a organização e role do usuário baseado em uma conexão
 * Retorna um novo objeto sem mutar o original
 */
export async function resolveOrganizationFromConnection(
  db: Kysely<Database>,
  connectionOrganizationId: string,
  userId?: string,
): Promise<{
  organization: OrganizationContext | null;
  role: string | null;
}> {
  // Busca a organização
  const organization = await fetchOrganization(db, connectionOrganizationId);

  if (!organization) {
    return { organization: null, role: null };
  }

  // Se não há usuário, retorna apenas a organização
  if (!userId) {
    return { organization, role: null };
  }

  // Busca o role do usuário nesta organização
  const role = await fetchUserRole(db, userId, organization.id);

  return { organization, role };
}
