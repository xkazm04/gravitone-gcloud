import "server-only";

// The PartPort as an editor receives it: the Server Actions gathered on the server and handed
// to the client island as a prop (the produce port's shape, ../../_port/wire.ts).
import type { PartPort } from "./contract.ts";
import { act, actReceipt, loadPart, opPart, undoPart } from "./actions.ts";

export const PART_PORT: PartPort = { loadPart, opPart, undoPart, actReceipt, act };
