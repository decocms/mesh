import type {
  DecoBlocksBinding,
  BlockDefinition,
  LoaderDefinition,
} from "@decocms/bindings";
import type { TypedToolCaller } from "@decocms/bindings";

// TypedToolCaller typed to DECO_BLOCKS_BINDING
type BlocksToolCaller = TypedToolCaller<DecoBlocksBinding>;

export async function listBlocks(
  toolCaller: BlocksToolCaller,
): Promise<BlockDefinition[]> {
  const result = await toolCaller("BLOCKS_LIST", {});
  return result.blocks;
}

export async function listLoaders(
  toolCaller: BlocksToolCaller,
): Promise<LoaderDefinition[]> {
  const result = await toolCaller("LOADERS_LIST", {});
  return result.loaders;
}
