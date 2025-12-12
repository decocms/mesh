import { nanoid } from "nanoid";

export function generateConnectionId() {
  return `conn_${nanoid()}`;
}
