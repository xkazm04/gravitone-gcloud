// THE REVIEWER'S ENVIRONMENT: the security boundary that decides which variables
// a third-party reviewer binary may see.
//
// Split out of cliSeam.ts (the door, which re-exports this) and kept alone on
// purpose: reviewerEnv is the function that builds the environment handed to a
// reviewer, so it can be read without the spawner around it. Moved verbatim; the
// credential pattern is unchanged.

import { seatOnlyEnv } from "@/lib/claudeCli";

import { reviewerCommand } from "./reviewerCommand";
import type { ReviewerEngineName } from "./reviewerEngines";

/*
 * CREDENTIALS. Every reviewer gets `reviewerEnv()`: the writer's metered-key
 * strip, then every variable whose NAME looks like a credential removed. A
 * reviewer reads untrusted pages with a model that can be talked into things;
 * codex's read-only sandbox still runs read-only shell commands, and an
 * environment variable is one `echo` away from a search query. The CLIs
 * authenticate from their own login files, which this does not touch.
 */

/** A variable NAME that looks like a credential. */
const CREDENTIAL_NAME = /(API_?KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_?KEY|AUTH)/i;

/** The reviewer environment: the metered-key strip, then every credential-
 *  looking variable removed, then the engine's own extras. */
export function reviewerEnv(engine: ReviewerEngineName, base: NodeJS.ProcessEnv = seatOnlyEnv()): NodeJS.ProcessEnv {
  const env = { ...base };
  for (const k of Object.keys(env)) if (CREDENTIAL_NAME.test(k)) delete env[k];
  return { ...env, ...reviewerCommand({ engine, model: "m", effort: "high", cwd: ".", prompt: "", timeoutMin: 1 }).env };
}
