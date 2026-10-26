import "server-only";

// The ScoutPort as the route receives it: the Server Actions, gathered on the server and handed to the client
// island as a prop (a reference per action crosses, never the module) - the Board's and the Library's shape.
import type { ScoutPort } from "./contract.ts";

import { pauseBranchAction, resumeBranchAction, setSplitAction } from "./actions.ts";

export const SCOUT_PORT: ScoutPort = { pause: pauseBranchAction, resume: resumeBranchAction, split: setSplitAction };
