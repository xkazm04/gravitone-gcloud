// THE CAPABILITY MATRIX, AS THE SERVER KNOWS IT — flags plus facts.
//
// lib/capabilities.ts holds the flags and the rule that combines them with
// facts, and it is read in the browser, so it may not name a key or read a
// posture. This file is the server's half: it reads the two facts from their
// owning modules (never re-derived here) and hands them in. GET
// /api/capabilities serves the result to the browser; pipeline/preflight.mts
// and the deployment-cell lane read it directly.
//
// SERVER ONLY. It imports lib/music/elevenlabs.ts, which a client bundle must
// never carry.

import { capabilities, type Capabilities, type DeploymentFacts } from "./capabilities";
import { canSpawnLocalBinaries } from "./deployment";
import { isMusicConfigured } from "./music/elevenlabs";

/** The facts of THIS process, read per call (a key set after boot counts). */
export function deploymentFacts(): DeploymentFacts {
  return { musicKey: isMusicConfigured(), localBinaries: canSpawnLocalBinaries() };
}

export function serverCapabilities(): Capabilities {
  return capabilities(deploymentFacts());
}
