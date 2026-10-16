import "server-only";

// The StylePort as the atelier receives it: the Server Actions gathered on the server and handed
// to the client island as a prop (the part port's shape, ../../../projects/[id]/_part/wire.ts).
import { act, actReceipt, loadStyle, opStyle } from "./actions.ts";
import type { StylePort } from "./contract.ts";

export const STYLE_PORT: StylePort = { loadStyle, opStyle, actReceipt, act };
