import "server-only";

// The BoardPort as the desks receive it: the Server Actions, gathered on the server and handed
// to the client island as a prop (a reference per action crosses, never the module). `redrive`
// rides beside the port: it is the decided desk's act on a stuck apply, not a desk verb.
import type { BoardPort } from "@gt/ui/board/port";

import { commit, listPackets, loadPacket, patch, pick, preview, redrive, returnPacket, undo } from "./actions.ts";

export const BOARD_PORT: BoardPort = { loadPacket, listPackets, patch, undo, pick, preview, commit, returnPacket };
export const BOARD_REDRIVE = redrive;
