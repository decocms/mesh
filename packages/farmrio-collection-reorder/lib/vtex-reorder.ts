import type { FarmrioRankedItem } from "@decocms/bindings";

type ApplyPayloadError = {
  ok: false;
  error: string;
};

type ApplyPayloadSuccess = {
  ok: true;
  collectionId: string;
  productIds: string[];
  productCount: number;
};

export type VtexApplyPayloadResult = ApplyPayloadSuccess | ApplyPayloadError;

/**
 * Builds the VTEX apply payload from a ranked list.
 * Uses rankedItem.productId (or aliases) as the product identifier.
 * Falls back to rankedItem.id for legacy rows.
 * vtexCollectionId is the collection's DB id (used as VTEX collection id).
 */
export function buildVtexApplyPayload(
  rows: FarmrioRankedItem[],
  vtexCollectionId: number | string,
): VtexApplyPayloadResult {
  if (rows.length === 0) {
    return {
      ok: false,
      error: "Nao ha itens na sugestao para aplicar.",
    };
  }

  const orderedRows = [...rows].sort((a, b) => a.position - b.position);
  const productIds: string[] = [];

  for (const row of orderedRows) {
    const rankedRow = row as FarmrioRankedItem & {
      productId?: string | number;
      product_id?: string | number;
      ProductId?: string | number;
    };
    const rawProductId =
      rankedRow.productId ??
      rankedRow.product_id ??
      rankedRow.ProductId ??
      rankedRow.id;
    const productId = rawProductId != null ? String(rawProductId) : null;
    if (!productId) {
      return {
        ok: false,
        error: `Product ID ausente no item #${row.position} (${row.label}).`,
      };
    }
    productIds.push(productId);
  }

  return {
    ok: true,
    collectionId: String(vtexCollectionId),
    productIds,
    productCount: productIds.length,
  };
}
