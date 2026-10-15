import "server-only";

import { z } from "zod";

import { parseAt, type Parsed } from "@gt/domain/door";
import { err, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";

import { readTakes } from "../../../../lib/sound/store.ts";
import { bump, facts, instant, words } from "../facts.ts";
import type { IngestEvent, ProjectCtx, Projection, Source, WeirItem } from "../types.ts";

// THE SOUND SHELF, PROJECTED - <sound store>/takes.json (lib/sound/store.ts
// readTakes), added in Phase 3 (wave B ruling 5) because Phase 2 never read it
// and the audio triage pile therefore had no Weir item for the Floor to draw or
// the Board to open.
//
// Recorded: take.create at `createdAt`; verdict.kept | verdict.rejected at
// `judgedAt` (a verdict cleared back to `unjudged` leaves its fact in the
// ledger, which is history, not state). A take with no judgedAt is judged at
// an observed instant, the facts.ts rule. No live work: a take is made by a
// call that returns it whole (lib/sound/takes.ts), so nothing here runs.
//
// THE WEIR: unjudged takes that are not demo fixtures (origin `fixture` has no
// file and nobody judges it - lib/decision/v1/sources/audio.ts `pending`) are
// ONE cull pile, `audio/triage`, the bare base the audio adapter resolves to
// the current pile (ruling 4).

const takeSchema = z.object({
  id: z.string().min(1),
  kind: z.string(),
  title: z.string(),
  provider: z.string(),
  origin: z.string(),
  verdict: z.enum(["unjudged", "kept", "rejected"]),
  createdAt: z.string(),
  judgedAt: z.string().nullable(),
});
const fileSchema = z.object({ takes: z.array(takeSchema) });

export type SoundShelf = Parsed<z.output<typeof fileSchema>>;
type Take = SoundShelf["takes"][number];

/** The audio triage pile's Weir id (lib/decision/v1/sources/audio.ts AUDIO_PILE, its bare base). */
export const AUDIO_WEIR_ID = "audio/triage";
const HREF = "/floor?lane=audio";
const OPERATOR: Actor = { kind: "operator", id: "operator" };

async function read(): Promise<Result<SoundShelf>> {
  let raw: unknown;
  try {
    raw = await readTakes();
  } catch (e) {
    return err("unavailable", `sound: readTakes failed: ${words(e)}`, { cause: e });
  }
  return parseAt("takes.json", fileSchema, raw);
}

const makerOf = (t: Pick<Take, "origin" | "provider">): Actor => (t.origin === "agent" ? { kind: "agent", id: `sound-${t.provider}` } : t.origin === "fixture" ? { kind: "machine", id: "fixture" } : OPERATOR);

function eventsOf(s: SoundShelf, ctx: ProjectCtx): IngestEvent[] {
  const f = facts("sound", ctx);
  const out: IngestEvent[] = [];
  for (const t of s.takes) {
    const subject = { kind: "take", id: t.id };
    const data = { runId: t.id, title: t.title, kind: t.kind, provider: t.provider, origin: t.origin };
    out.push(f.recorded(t.id, "create", t.createdAt, { actor: makerOf(t), type: "take.create", subject, lane: "audio", data }));
    if (t.verdict !== "unjudged") out.push(f.recorded(t.id, `verdict.${t.verdict}`, t.judgedAt, { actor: OPERATOR, type: `verdict.${t.verdict}`, subject, lane: "audio", data: { runId: t.id } }));
  }
  return out;
}

function tallyOf(s: SoundShelf): Projection["tally"] {
  const records: Record<string, number> = {};
  const fs: Record<string, number> = {};
  for (const t of s.takes) {
    bump(records, `take.${t.verdict}`);
    bump(fs, "take.create");
    if (t.verdict !== "unjudged") bump(fs, `verdict.${t.verdict}`);
  }
  return { records, facts: fs };
}

const pending = (t: Take): boolean => t.verdict === "unjudged" && t.origin !== "fixture";

function weirOf(s: SoundShelf): WeirItem[] {
  const waiting = s.takes.filter(pending);
  if (waiting.length === 0) return [];
  const judgeable = s.takes.filter((t) => t.origin !== "fixture");
  const oldest = waiting.map((t) => instant(t.createdAt)).filter((x): x is string => x !== null).sort()[0];
  return [{ source: "sound", id: AUDIO_WEIR_ID, title: "takes to triage", media: "audio", kind: "cull", ...(oldest === undefined ? {} : { since: oldest }), decided: judgeable.length - waiting.length, pending: waiting.length, href: HREF }];
}

export function projectSound(s: SoundShelf, ctx: ProjectCtx): Projection {
  return { events: eventsOf(s, ctx), live: [], weir: weirOf(s), tally: tallyOf(s), skipped: [] };
}

export const soundSource: Source<SoundShelf> = { id: "sound", read, project: projectSound };
