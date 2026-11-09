import "server-only";

// The BoardPort as the desks receive it: the Server Actions, gathered on the server and handed
// to the client island as a prop (a reference per action crosses, never the module). `redrive`
// rides beside the port: it is the decided desk's act on a stuck apply, not a desk verb. So do
// the live feed's head and the decided desk's "made" count (../_board/live.ts BoardDoors).
import type { BoardPort } from "@gt/ui/board/port";

import type { BoardDoors } from "../_board/live.ts";
import { madeBy } from "../../library/_port/made.ts";
import { commit, listPackets, loadPacket, patch, pick, preview, redrive, returnPacket, undo } from "./actions.ts";
import { boardHead } from "./head.ts";

export const BOARD_PORT: BoardPort & BoardDoors = { loadPacket, listPackets, patch, undo, pick, preview, commit, returnPacket, head: boardHead, made: madeBy };
export const BOARD_REDRIVE = redrive;
