import "server-only";

// The ProducePort as the screens receive it: the Server Actions, gathered on the server and
// handed to a client island as a prop (a reference per action crosses, never the module) - the
// Board's shape (../../board/_port/wire.ts).
import type { ProducePort } from "./contract.ts";

import {
  ackLane,
  compose,
  composeChoices,
  composerChoices,
  composerReceipt,
  discard,
  launchPlan,
  launchRun,
  listProjects,
  loadPlan,
  moveJob,
  pauseJob,
  planReceipt,
  rename,
  reroute,
  rerouteOptions,
  resumeJob,
  retryJob,
  setPart,
} from "./actions.ts";

export const PRODUCE_PORT: ProducePort = {
  composerChoices,
  composerReceipt,
  launchRun,
  listProjects,
  loadPlan,
  composeChoices,
  compose,
  setPart,
  rename,
  discard,
  planReceipt,
  launchPlan,
  pauseJob,
  resumeJob,
  retryJob,
  moveJob,
  rerouteOptions,
  reroute,
  ackLane,
};
