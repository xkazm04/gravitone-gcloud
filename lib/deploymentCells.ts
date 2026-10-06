// THE DEPLOYMENT CELLS — the postures this app runs in, declared once (CIP-B).
//
// The app runs on an operator's laptop and is being shaped for Cloud Run, and
// "which routes open, which capabilities show, which engine serves" differs
// between the two. A CELL is one named posture: the axis values it sets, the
// credentials it holds (by NAME — a declaration never carries a secret), and
// what lib/deployment.ts and lib/text/router.ts must answer in it.
//
// Two readers, and the reason this lives in lib/ rather than beside either:
//   · tests/golden-path/deployment-cells.probe.spec.ts runs every API route in
//     every cell (tests/golden-path/_cells.ts applies a cell to process.env,
//     with sentinel credential values and scratch store roots);
//   · pipeline/preflight.mts prints which cell the machine running it is in.
// An operator script must not import from tests/, and the lane must not keep a
// second copy of the cells, so the declaration sits where both may import it.
//
// SERVER ONLY. No filesystem, no environment read at module load.

import { ACCESS_SECRET_VAR } from "./apiAuth";
import { HOSTED_CAPS } from "./capabilities";
import { MANAGED_MARKERS, type LocalPosture } from "./deployment";
import { PRINCIPAL_MODE_VAR, PROJECT_ID_VAR } from "./principal";
import { RETRIEVE_FLAG } from "./text/env";
import type { TextProviderId } from "./text/types";

/** The posture knobs: what decides spawning, the text engine, the API gate,
 *  the client's world, the usage sink and the capability flags. Credentials are
 *  not here — a cell names those in `present`. */
export const POSTURE_AXES: readonly string[] = [
  "LOCAL_BINARIES",
  "TEXT_ENV",
  RETRIEVE_FLAG,
  "IMAGING_ENV",
  // lib/principal.ts: `verified` closes the shared-secret door. Every declared
  // cell runs the legacy default.
  PRINCIPAL_MODE_VAR,
  "NEXT_PUBLIC_DEV_AUTH",
  "NEXT_PUBLIC_LOCAL_MODE",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  PROJECT_ID_VAR,
  // The usage sink would POST every turn somewhere; off in every cell.
  "LIGHTTRACK_URL",
  "LIGHTTRACK_DISABLE",
  ...MANAGED_MARKERS,
  ...HOSTED_CAPS.map((h) => h.variable),
];

export interface Cell {
  name: string;
  /** Who runs like this, in a line. */
  who: string;
  /** Non-secret axes this cell sets; every other posture axis is unset. */
  env: Record<string, string>;
  /** Credentials (and the access secret) this cell HOLDS, by name. */
  present: string[];
  posture: LocalPosture;
  /** What `engineStatus("edit-plan")` serves, where `claude` is installed. */
  engine: TextProviderId | null;
}

const hosted = (): Record<string, string> => Object.fromEntries(HOSTED_CAPS.map((h) => [h.variable, h.value]));
const CLOUD_RUN = { K_SERVICE: "gravitone", K_REVISION: "gravitone-00001-abc" };

/** THE CELLS. A new posture is a new entry here, and every invariant in the
 *  lane judges it with no other edit. */
export const CELLS: readonly Cell[] = [
  {
    name: "laptop",
    who: "the operator's own machine, dev-auth on, every key present",
    env: { NEXT_PUBLIC_DEV_AUTH: "1", LIGHTTRACK_DISABLE: "1" },
    present: ["GOOGLE_AI_API_KEY", "ELEVENLABS_API_KEY", "LEONARDO_API_KEY"],
    posture: "available",
    engine: "claude-cli",
  },
  {
    name: "laptop-offline-rehearsal",
    who: "a laptop rehearsing the hosted posture: LOCAL_BINARIES=off, a real access secret",
    env: { LOCAL_BINARIES: "off", LIGHTTRACK_DISABLE: "1" },
    present: [ACCESS_SECRET_VAR, "GOOGLE_AI_API_KEY", "ELEVENLABS_API_KEY", "LEONARDO_API_KEY"],
    posture: "policy-forbidden",
    engine: "google",
  },
  {
    name: "cloud-run-saas",
    who: "the hosted service: Cloud Run markers, the Google key, the access secret, the hosted block",
    env: { ...CLOUD_RUN, LIGHTTRACK_DISABLE: "1", ...hosted() },
    present: [ACCESS_SECRET_VAR, "GOOGLE_AI_API_KEY"],
    posture: "managed-platform",
    engine: "google",
  },
  {
    name: "cloud-run-misconfigured",
    who: "the hosted service deployed without its Google key",
    env: { ...CLOUD_RUN, LIGHTTRACK_DISABLE: "1", ...hosted() },
    present: [ACCESS_SECRET_VAR],
    posture: "managed-platform",
    engine: null,
  },
  {
    name: "local-mode",
    who: "the single-user local build (NEXT_PUBLIC_LOCAL_MODE=1), no secret and no dev-auth",
    env: { NEXT_PUBLIC_LOCAL_MODE: "1", LIGHTTRACK_DISABLE: "1" },
    present: [],
    posture: "available",
    engine: "claude-cli",
  },
  {
    name: "ci-empty",
    who: "a CI runner: nothing configured at all",
    env: {},
    present: [],
    posture: "available",
    engine: "claude-cli",
  },
];

export type Caller = "secret" | "dev-auth" | "anonymous";

/** The caller a cell's requests come from: the dev bypass it turns on, the
 *  secret it holds, or nobody. */
export function callerOf(cell: Cell): Caller {
  if (cell.env.NEXT_PUBLIC_DEV_AUTH === "1") return "dev-auth";
  if (cell.present.includes(ACCESS_SECRET_VAR)) return "secret";
  return "anonymous";
}

/** Every credential name any cell holds — the credential axes this declaration
 *  can speak about. */
const credentialNames = (): string[] => [...new Set([ACCESS_SECRET_VAR, ...CELLS.flatMap((c) => c.present)])];

/** A shape over the declared axes: a credential or a managed marker (whose
 *  value is arbitrary) as its bare NAME when set, every other axis as
 *  NAME=value. Secret values never enter it, so it is safe to print. */
function shapeOf(env: Record<string, string | undefined>): Set<string> {
  const bare = new Set<string>([...credentialNames(), ...MANAGED_MARKERS]);
  return new Set(
    [...POSTURE_AXES, ...credentialNames()]
      .filter((v) => v !== "LIGHTTRACK_DISABLE" && env[v] !== undefined && env[v]!.trim() !== "")
      .map((v) => (bare.has(v) ? v : `${v}=${env[v]!.trim()}`)),
  );
}

const cellShape = (c: Cell): Set<string> =>
  shapeOf({ ...c.env, ...Object.fromEntries(c.present.map((v) => [v, "set"])) });

/**
 * Which declared cell `env` is closest to, and how it differs: `+X` is set here
 * and not in the cell, `-X` the reverse. An empty diff is an exact match.
 * Compared on the declared axes only — a credential no cell names (say, a
 * second imaging vendor's key) does not move the answer.
 */
export function nearestCell(env: Record<string, string | undefined> = process.env): { cell: Cell; diff: string[] } {
  const here = shapeOf(env);
  let best: { cell: Cell; diff: string[] } | null = null;
  for (const cell of CELLS) {
    const there = cellShape(cell);
    const diff = [
      ...[...here].filter((x) => !there.has(x)).map((x) => `+${x}`),
      ...[...there].filter((x) => !here.has(x)).map((x) => `-${x}`),
    ];
    if (!best || diff.length < best.diff.length) best = { cell, diff };
  }
  return best!;
}
