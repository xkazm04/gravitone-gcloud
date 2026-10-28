import "server-only";

// THE STUDIO'S TURN PORT, FIXTURE SIDE (spark audio-agent-studio, stage S1). The page reads turns
// through `StudioPort` only, so stage S2 swaps this for a ledger side (an agent's recorded turns)
// without touching a variant. Here the turns are the scripted sessions (./fixtureSessions.ts):
// their {{key}} audio tokens are resolved against the index pipeline/studio-fixtures.mts writes
// (<storeRoot()>/studio-fixtures.json), THEN every turn passes the agent's own door
// (@gt/domain/audio.studio.door), so a fixture is held to exactly what an agent's turn is.
//
// Absence is said, not hidden: no index, an unreadable one, or a key it does not hold reads
// `renders: "missing"` with a note naming the command that makes them, and every href or take id
// still holding `{{` is REMOVED before the door - which then drops what cannot stand without its
// audio, and says so in the turn's `dropped`. A turn whose envelope the door refuses entirely is
// named in the note (nothing on screen could carry it).
import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseStudioTurn, type ParsedTurn } from "@gt/domain/audio.studio.door";
import { parseJsonAt } from "@gt/domain/door";
import { z } from "zod";

import { storeRoot } from "../../../../../lib/sound/store.ts";
import { FIXTURE_SESSIONS, type FixtureSession } from "./fixtureSessions.ts";

export type StudioPortSession = { readonly id: string; readonly title: string; readonly turns: readonly ParsedTurn[] };
export type StudioRead = { readonly renders: "ready" | "missing"; readonly note?: string; readonly sessions: readonly StudioPortSession[] };
/** The seam: a fixture today, the ledger's recorded turns in stage S2. */
export type StudioPort = { readonly read: () => Promise<StudioRead> };

/** Same name as pipeline/studio-fixtures.mts STUDIO_FIXTURE_INDEX (a pipeline module is not imported by a route). */
const INDEX_FILE = "studio-fixtures.json";
const MAKE = "npm run studio:fixtures";
const indexSchema = z.object({ v: z.literal(1), takes: z.record(z.string(), z.string().min(1)) });

type Takes = Readonly<Record<string, string | undefined>>;
type Index = { readonly takes: Takes } | { readonly missing: string };

async function readIndex(): Promise<Index> {
  const file = path.join(storeRoot(), INDEX_FILE);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (e) {
    const code = (e as { code?: unknown }).code;
    return { missing: code === "ENOENT" ? `no fixture renders yet (${INDEX_FILE} is not in the sound store)` : `the fixture index could not be read (${String(code ?? e)})` };
  }
  const r = parseJsonAt("studio fixture index", indexSchema, text);
  return r.ok ? { takes: r.value.takes } : { missing: `the fixture index is unreadable: ${r.error.message}` };
}

const TOKEN = /\{\{([a-z0-9-]+)\}\}/g;

/** Every string with its tokens resolved; `unknown` collects keys the index lacks. */
function resolve(v: unknown, takes: Takes, unknown: Set<string>): unknown {
  if (typeof v === "string")
    return v.replace(TOKEN, (whole, key: string) => {
      const id = takes[key];
      if (id === undefined) unknown.add(key);
      return id ?? whole;
    });
  if (Array.isArray(v)) return v.map((x) => resolve(x, takes, unknown));
  if (typeof v === "object" && v !== null) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x, takes, unknown)]));
  return v;
}

/** Remove every `href` and `takeId` still holding a token: no request to a path that cannot exist. */
export function stripUnresolved(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripUnresolved);
  if (typeof v === "object" && v !== null)
    return Object.fromEntries(
      Object.entries(v)
        .filter(([k, x]) => !((k === "href" || k === "takeId") && typeof x === "string" && x.includes("{{")))
        .map(([k, x]) => [k, stripUnresolved(x)]),
    );
  return v;
}

/** One scripted session through the token index and the door. Exported for the port's test. */
export function readSession(s: FixtureSession, takes: Takes, unknown: Set<string>, refused: string[]): StudioPortSession {
  const turns: ParsedTurn[] = [];
  for (const raw of s.turns) {
    const r = parseStudioTurn(stripUnresolved(resolve(raw, takes, unknown)));
    if (r.ok) turns.push(r.value);
    else refused.push(`${s.id}: ${r.error.message}`);
  }
  return { id: s.id, title: s.title, turns };
}

export function readFixture(index: Index, sessions: readonly FixtureSession[] = FIXTURE_SESSIONS): StudioRead {
  const takes = "takes" in index ? index.takes : {};
  const unknown = new Set<string>();
  const refused: string[] = [];
  const read = sessions.map((s) => readSession(s, takes, unknown, refused));
  const notes: string[] = [];
  if ("missing" in index) notes.push(`${index.missing}. Run ${MAKE} to render them; until then the pieces that need audio are dropped and say so.`);
  else if (unknown.size > 0) notes.push(`the fixture index has no render for ${[...unknown].sort().join(", ")}. Run ${MAKE} again.`);
  if (refused.length > 0) notes.push(`turns refused at the door: ${refused.join("; ")}`);
  const missing = "missing" in index || unknown.size > 0;
  return { renders: missing ? "missing" : "ready", ...(notes.length > 0 ? { note: notes.join(" ") } : {}), sessions: read };
}

export const fixturePort: StudioPort = { read: async () => readFixture(await readIndex()) };
