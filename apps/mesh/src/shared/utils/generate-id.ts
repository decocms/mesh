import { nanoid } from "nanoid";

type IdPrefixes = "conn" | "audit" | "log" | "gw" | "gwc" | "folder";

export function generatePrefixedId(prefix: IdPrefixes) {
  return `${prefix}_${nanoid()}`;
}
