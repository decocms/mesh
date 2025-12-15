import { nanoid } from "nanoid";

type IdPrefixes =
  | "conn"
  | "audit"
  | "log";

export function generatePrefixedId(prefix: IdPrefixes) {
  return `${prefix}_${nanoid()}`;
}
