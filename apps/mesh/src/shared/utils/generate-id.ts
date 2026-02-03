import { nanoid } from "nanoid";

type IdPrefixes =
  | "conn"
  | "audit"
  | "log"
  | "vir"
  | "virc"
  | "agg"
  | "dtok"
  | "thrd"
  | "msg"
  | "tag"
  | "mtag";

export function generatePrefixedId(prefix: IdPrefixes) {
  return `${prefix}_${nanoid()}`;
}
