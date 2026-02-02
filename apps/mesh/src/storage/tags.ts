/**
 * Tag Storage Implementation
 *
 * Handles CRUD operations for organization tags and member tag assignments.
 * Tags are organization-scoped and used for business unit separation in monitoring.
 */

import type { Kysely } from "kysely";
import type { Database, OrganizationTag } from "./types";
import { generatePrefixedId } from "@/shared/utils/generate-id";

// ============================================================================
// Tag Storage Implementation
// ============================================================================

export class TagStorage {
  constructor(private db: Kysely<Database>) {}

  // ============================================================================
  // Organization Tags
  // ============================================================================

  /**
   * List all tags for an organization
   */
  async listOrgTags(organizationId: string): Promise<OrganizationTag[]> {
    const rows = await this.db
      .selectFrom("organization_tags")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .orderBy("name", "asc")
      .execute();

    return rows.map((row) => this.tagFromDbRow(row));
  }

  /**
   * Get a tag by ID
   */
  async getTag(tagId: string): Promise<OrganizationTag | null> {
    const row = await this.db
      .selectFrom("organization_tags")
      .selectAll()
      .where("id", "=", tagId)
      .executeTakeFirst();

    return row ? this.tagFromDbRow(row) : null;
  }

  /**
   * Get a tag by name within an organization
   */
  async getTagByName(
    organizationId: string,
    name: string,
  ): Promise<OrganizationTag | null> {
    const row = await this.db
      .selectFrom("organization_tags")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .where("name", "=", name)
      .executeTakeFirst();

    return row ? this.tagFromDbRow(row) : null;
  }

  /**
   * Create a new tag for an organization
   * Returns the existing tag if one with the same name already exists
   */
  async createTag(
    organizationId: string,
    name: string,
  ): Promise<OrganizationTag> {
    // Check if tag already exists
    const existing = await this.getTagByName(organizationId, name);
    if (existing) {
      return existing;
    }

    const id = generatePrefixedId("tag");
    const now = new Date().toISOString();

    await this.db
      .insertInto("organization_tags")
      .values({
        id,
        organization_id: organizationId,
        name,
        created_at: now,
      })
      .execute();

    return {
      id,
      organizationId,
      name,
      createdAt: now,
    };
  }

  /**
   * Delete a tag by ID
   * This will cascade delete all member_tags assignments
   */
  async deleteTag(tagId: string): Promise<void> {
    await this.db
      .deleteFrom("organization_tags")
      .where("id", "=", tagId)
      .execute();
  }

  // ============================================================================
  // Member Tags
  // ============================================================================

  /**
   * Get all tags assigned to a member
   */
  async getMemberTags(memberId: string): Promise<OrganizationTag[]> {
    const rows = await this.db
      .selectFrom("member_tags")
      .innerJoin(
        "organization_tags",
        "organization_tags.id",
        "member_tags.tag_id",
      )
      .select([
        "organization_tags.id",
        "organization_tags.organization_id",
        "organization_tags.name",
        "organization_tags.created_at",
      ])
      .where("member_tags.member_id", "=", memberId)
      .orderBy("organization_tags.name", "asc")
      .execute();

    return rows.map((row) => this.tagFromDbRow(row));
  }

  /**
   * Set tags for a member (replaces all existing assignments)
   */
  async setMemberTags(memberId: string, tagIds: string[]): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      // Remove all existing tags for this member
      await trx
        .deleteFrom("member_tags")
        .where("member_id", "=", memberId)
        .execute();

      // Add new tags
      if (tagIds.length > 0) {
        const now = new Date().toISOString();
        await trx
          .insertInto("member_tags")
          .values(
            tagIds.map((tagId) => ({
              id: generatePrefixedId("mtag"),
              member_id: memberId,
              tag_id: tagId,
              created_at: now,
            })),
          )
          .execute();
      }
    });
  }

  /**
   * Add a single tag to a member (idempotent)
   */
  async addMemberTag(memberId: string, tagId: string): Promise<void> {
    // Check if already assigned
    const existing = await this.db
      .selectFrom("member_tags")
      .select("id")
      .where("member_id", "=", memberId)
      .where("tag_id", "=", tagId)
      .executeTakeFirst();

    if (existing) {
      return; // Already assigned
    }

    const now = new Date().toISOString();
    await this.db
      .insertInto("member_tags")
      .values({
        id: generatePrefixedId("mtag"),
        member_id: memberId,
        tag_id: tagId,
        created_at: now,
      })
      .execute();
  }

  /**
   * Remove a single tag from a member
   */
  async removeMemberTag(memberId: string, tagId: string): Promise<void> {
    await this.db
      .deleteFrom("member_tags")
      .where("member_id", "=", memberId)
      .where("tag_id", "=", tagId)
      .execute();
  }

  // ============================================================================
  // Bulk Operations for Monitoring
  // ============================================================================

  /**
   * Get all tags for a user in a specific organization
   * This is used by the monitoring system to inject tags into properties
   */
  async getUserTagsInOrg(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationTag[]> {
    const rows = await this.db
      .selectFrom("member")
      .innerJoin("member_tags", "member_tags.member_id", "member.id")
      .innerJoin(
        "organization_tags",
        "organization_tags.id",
        "member_tags.tag_id",
      )
      .select([
        "organization_tags.id",
        "organization_tags.organization_id",
        "organization_tags.name",
        "organization_tags.created_at",
      ])
      .where("member.userId", "=", userId)
      .where("member.organizationId", "=", organizationId)
      .orderBy("organization_tags.name", "asc")
      .execute();

    return rows.map((row) => this.tagFromDbRow(row));
  }

  /**
   * Get members with their tags for an organization
   * Returns a map of memberId -> tag names
   */
  async getMembersWithTags(
    organizationId: string,
  ): Promise<Map<string, string[]>> {
    const rows = await this.db
      .selectFrom("member")
      .leftJoin("member_tags", "member_tags.member_id", "member.id")
      .leftJoin(
        "organization_tags",
        "organization_tags.id",
        "member_tags.tag_id",
      )
      .select(["member.id as memberId", "organization_tags.name as tagName"])
      .where("member.organizationId", "=", organizationId)
      .execute();

    const result = new Map<string, string[]>();
    for (const row of rows) {
      if (!result.has(row.memberId)) {
        result.set(row.memberId, []);
      }
      if (row.tagName) {
        result.get(row.memberId)!.push(row.tagName);
      }
    }

    return result;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private tagFromDbRow(row: {
    id: string;
    organization_id: string;
    name: string;
    created_at: string | Date;
  }): OrganizationTag {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      createdAt: row.created_at,
    };
  }
}
