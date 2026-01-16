import { nanoid } from "nanoid";

type IdPrefixes =
  | "conn"
  | "audit"
  | "log"
  | "gw"
  | "gwc"
  | "dtok"
  | "thrd"
  | "msg";

export function generatePrefixedId(prefix: IdPrefixes) {
  return `${prefix}_${nanoid()}`;
}

export function idMatchesPrefix(id: string, prefix: IdPrefixes): boolean {
  return id.startsWith(`${prefix}_`);
}
