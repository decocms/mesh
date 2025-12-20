import { nanoid } from "nanoid";

type IdPrefixes = "conn" | "audit" | "log" | "gw" | "gwc";

export function generatePrefixedId(prefix: IdPrefixes) {
  return `${prefix}_${nanoid()}`;
}
