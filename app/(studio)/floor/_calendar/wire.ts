import "server-only";

// The CalendarPort as the Floor receives it: the Server Actions, gathered on the server and
// handed to the client island as a prop (a reference per action crosses, never the module) -
// the Library's and the Board's shape.
import type { CalendarPort } from "./contract.ts";

import { cancel, detail, move, publishNow } from "./actions.ts";

export const CALENDAR_PORT: CalendarPort = { detail, move, cancel, publishNow };
