import { Freestyle } from "freestyle-sandboxes";

export function createFreestyleClient(apiKey: string): Freestyle {
  return new Freestyle({ apiKey });
}
