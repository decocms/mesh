import { IceBreakers } from "./ice-breakers";
import {
  useGatewayPrompts,
  type GatewayPrompt,
} from "@/web/hooks/use-gateway-prompts";

interface GatewayIceBreakersProps {
  gatewayId: string;
  onSelect: (prompt: GatewayPrompt) => void;
  className?: string;
}

/**
 * Ice breakers component that uses suspense to fetch gateway prompts
 */
export function GatewayIceBreakers({
  gatewayId,
  onSelect,
  className = "mt-6",
}: GatewayIceBreakersProps) {
  const { data: prompts } = useGatewayPrompts(gatewayId);

  if (prompts.length === 0) return null;

  return (
    <IceBreakers prompts={prompts} onSelect={onSelect} className={className} />
  );
}
