import "server-only";

// THE SCRIPTED STORY (spark concept-casting-stages S0): one slate of concepts, each at a different stage, so every
// layout shows the same work at its real density. Every record goes through the real door (@gt/domain/production) -
// the fixture cannot drift from the contract. No backend, no vendor call, no GPU.
//
// PICTURES are real renders, downscaled to public/deck-art/productions/ from foundry-out/scout-codex/2026-11-08. No
// fixture audio exists in the repo, so a voice has no `preview` key and the screen draws a marked silent stub.

import { parseAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import { castRoundSchema, productionLessonSchema, productionSchema } from "@gt/domain/production";
import type { z } from "zod";

import type { ProductionEntry, ProductionsView } from "./contract.ts";

const PICS = "/deck-art/productions";
const NOW = "2026-11-09T09:00:00Z";
const BY = "operator";

type RawProduction = z.input<typeof productionSchema>;
type RawRound = z.input<typeof castRoundSchema>;
type RawLesson = z.input<typeof productionLessonSchema>;
type Raw = { readonly production: RawProduction; readonly logline: string; readonly poster?: string; readonly keptOnly?: true; readonly rounds?: readonly RawRound[]; readonly lessons?: readonly RawLesson[] };

const base = (slug: string, title: string, source: RawProduction["source"], stage: RawProduction["stage"]): RawProduction => ({
  id: `prdn:${slug}`,
  title,
  source,
  stage,
  takes: [],
  roles: [],
  startedAt: NOW,
  startedBy: BY,
});

const BEATS = ["the door", "the wheel turns", "the empty shelf"];
const hero = (id: string, beat: string, n: number, extra: Partial<RawProduction["takes"][number]> = {}): RawProduction["takes"][number] => ({
  id,
  kind: "hero",
  state: "ready",
  beats: [beat],
  at: NOW,
  poster: `${PICS}/panel-${n}.webp`,
  ...extra,
});
const rough = (id: string, n: number, extra: Partial<RawProduction["takes"][number]> = {}): RawProduction["takes"][number] => ({
  id,
  kind: "rough",
  state: "ready",
  beats: BEATS,
  at: NOW,
  poster: `${PICS}/panel-${n}.webp`,
  ...extra,
});

const ROLE_ARCHER = { id: "archer", name: "The archer", brief: "A smuggler past her prime who still shoots straight; dry, unhurried.", auditionScript: "[quiet, amused] You came all this way for a lantern?" };
const ROLE_HARBOURMASTER = { id: "harbourmaster", name: "The harbourmaster", brief: "Keeps every ledger in his head and resents it.", auditionScript: "[tired] Three ships in, two ships out, and one that was never here." };

const CHR = (n: number): string => `chr:01JC9Z0Q5V3T8K2M4N6P7R9S${String(n).padStart(2, "0")}`;
const bora = (name: string, look: string, personality: string, pic: string) => ({ card: { name, look, personality }, images: [`${PICS}/${pic}.webp`] });

const charactersFor = (round: string): RawRound["characters"] => [
  { id: `${round}/c-1`, origin: "reused", characterId: CHR(1), ...bora("Bora Vale", "black hooded cloak over field leathers", "dry, patient, misses nothing", "bora-concept"), usedBefore: [{ label: "codex board 11-08, r2-002", at: "2026-11-08" }], match: "fits: an archer who has done this before" },
  { id: `${round}/c-2`, origin: "reused", characterId: CHR(2), ...bora("Ilse Marrow", "hair tied high, plain working coat", "careful, sharp when pushed", "bora-hair"), usedBefore: [{ label: "night 11-03, The Quiet Desk", at: "2026-11-03" }, { label: "night 10-28, storyboard c-04", at: "2026-10-28" }] },
  { id: `${round}/c-3`, origin: "new", ...bora("Sena Oyelaran", "weathered cloak, bow case slung behind", "laughs before she answers", "bora-scene") },
  { id: `${round}/c-4`, origin: "new", ...bora("Teodora Rask", "turnaround sheet, three costume plates", "quiet, watches the door", "bora-sheet") },
  { id: `${round}/c-5`, origin: "new", card: { name: "Hae-won Pyo", look: "still being designed for the case", personality: "unwritten until the design lands" }, images: [] },
];

const voicesFor = (round: string, heard: readonly number[] = []): RawRound["voices"] =>
  [
    { n: 1, label: "Warm alto, late thirties", design: "[quiet] warm alto with a slow smile behind it" },
    { n: 2, label: "Dry, low, unhurried", design: "[deadpan] low female voice, very little breath" },
    { n: 3, label: "Bright, clipped", design: "[brisk] clipped consonants, northern, young" },
    { n: 4, label: "Husky storyteller", design: "[confiding] husky, leaning close to the mic" },
    { n: 5, label: "Worn, kind", design: "[gentle] worn voice, patient, slightly hoarse" },
  ].map(({ n, label, design }) => ({ id: `${round}/v-${n}`, label, design, ...(heard.includes(n) ? { heardAt: NOW } : {}) }));

const SLATE: readonly Raw[] = [
  { production: base("harbour-first-snow", "Harbour at First Snow", { kind: "codex-board", ref: "2026-11-08/t6-r2-002" }, "accepted"), logline: "A smuggler returns to a port that no longer needs her.", poster: `${PICS}/bora-scene.webp`, keptOnly: true },
  { production: base("night-shift-ledger", "The Night Shift Ledger", { kind: "episode", ref: "chn-quiet-desk/ep-14" }, "accepted"), logline: "An auditor finds one line that should not balance.", poster: `${PICS}/panel-4.webp`, keptOnly: true },
  { production: base("unlit-stairwell", "Unlit Stairwell", { kind: "outline", ref: "ol-2026-11-07-03" }, "accepted"), logline: "An outline nobody has boarded yet: a building that adds a floor at night.", keptOnly: true },
  {
    production: { ...base("locksmiths-confession", "The Locksmith's Confession", { kind: "episode", ref: "chn-heist/ep-09" }, "hero"), takes: [hero("t-1", "the door", 1), hero("t-2", "the wheel turns", 2), hero("t-3", "the empty shelf", 5, { state: "failed", error: "gpu.local: render stopped at frame 41 of 96 (out of memory)" })] },
    logline: "He built the vault. Now he has to tell them how it opens.",
    poster: `${PICS}/panel-1.webp`,
  },
  {
    production: { ...base("deep-vault", "The Deep Vault", { kind: "codex-board", ref: "2026-11-08/t1-S1-10" }, "rough"), takes: [hero("t-1", "the door", 1,), hero("t-2", "the wheel turns", 3), rough("t-3", 2)] },
    logline: "A bank vault opened for the first time in forty years.",
    poster: `${PICS}/panel-3.webp`,
  },
  {
    production: { ...base("salt-road", "The Salt Road", { kind: "outline", ref: "ol-2026-11-05-11" }, "proven"), takes: [rough("t-1", 2, { provenAt: NOW, provenBy: BY })] },
    logline: "Two carriers, one sealed crate, nine days of road.",
    poster: `${PICS}/panel-2.webp`,
  },
  {
    production: { ...base("archers-return", "The Archer's Return", { kind: "codex-board", ref: "2026-11-08/t6-r2-002" }, "casting"), takes: [rough("t-1", 2, { provenAt: NOW, provenBy: BY })], roles: [ROLE_ARCHER, ROLE_HARBOURMASTER] },
    logline: "She came back for the debt, not the people.",
    poster: `${PICS}/bora-concept.webp`,
    rounds: [
      { id: "round-archer", productionId: "prdn:archers-return", roleId: "archer", at: NOW, characters: charactersFor("round-archer"), voices: voicesFor("round-archer", [2]), picks: {}, creditsUsed: 412, creditsRead: "character-cost-header" },
      { id: "round-harbour", productionId: "prdn:archers-return", roleId: "harbourmaster", at: NOW, characters: charactersFor("round-harbour"), voices: voicesFor("round-harbour"), picks: {}, creditsUsed: 388, creditsRead: "subscription-delta" },
    ],
  },
  {
    production: { ...base("lantern-toll", "The Lantern Toll", { kind: "episode", ref: "chn-heist/ep-11" }, "audio"), takes: [rough("t-1", 4, { provenAt: NOW, provenBy: BY })], roles: [{ ...ROLE_ARCHER, cast: { characterId: CHR(1), voiceId: "el-voice-scripted", roundId: "round-lantern", pickedAt: NOW, pickedBy: BY } }] },
    logline: "A toll collector who has never once been paid in coin.",
    poster: `${PICS}/panel-5.webp`,
  },
  {
    production: { ...base("sigil-run", "Sigil Run", { kind: "codex-board", ref: "2026-11-07/t3-S2-04" }, "cutting"), takes: [rough("t-1", 1, { provenAt: NOW, provenBy: BY })], roles: [{ ...ROLE_ARCHER, cast: { characterId: CHR(2), voiceId: "el-voice-scripted-2", roundId: "round-sigil", pickedAt: NOW, pickedBy: BY } }], audio: { voice: "dub", music: "score", decidedAt: NOW, decidedBy: BY }, cut: { format: "trailer", state: "on-board", receipt: "rcpt-sigil-01", packetId: "pkt:production:sigil-run", at: NOW } },
    logline: "A courier carries a mark she cannot read.",
    poster: `${PICS}/panel-4.webp`,
  },
  {
    production: { ...base("archivist", "The Archivist", { kind: "episode", ref: "chn-quiet-desk/ep-07" }, "done"), takes: [rough("t-1", 2, { provenAt: NOW, provenBy: BY })], roles: [{ ...ROLE_HARBOURMASTER, cast: { characterId: CHR(1), voiceId: "el-voice-scripted-3", roundId: "round-archivist", pickedAt: NOW, pickedBy: BY } }], audio: { voice: "ref-audio", music: "track", decidedAt: NOW, decidedBy: BY }, cut: { format: "music-clip", state: "approved", receipt: "rcpt-archivist-02", packetId: "pkt:production:archivist", at: NOW } },
    logline: "Everything she filed for thirty years, filed once more.",
    poster: `${PICS}/panel-3.webp`,
    lessons: [
      { id: "lesson-beats", productionId: "prdn:archivist", dimension: "beats", state: "proposed", text: "Hold the reveal for two beats after the door opens: the pause did the work the music was doing.", proposedAt: NOW },
      { id: "lesson-art", productionId: "prdn:archivist", dimension: "art-style", state: "proposed", text: "Teal shadows and a single warm practical held across every panel; the warm source is what reads as a place.", proposedAt: NOW },
      { id: "lesson-technique", productionId: "prdn:archivist", dimension: "technique", state: "proposed", text: "A locked camera survives the first-last-frame handoff; a pan on the same shot broke the plate twice.", proposedAt: NOW },
    ],
  },
  { production: { ...base("mirror-bay", "Mirror Bay", { kind: "outline", ref: "ol-2026-11-02-06" }, "dropped"), takes: [hero("t-1", "the door", 5)] }, logline: "Dropped after the first hero shot: the idea needed a cast it could not have.", poster: `${PICS}/panel-5.webp` },
];

function entryOf(raw: Raw): Result<ProductionEntry> {
  const production = parseAt("fixture production", productionSchema, raw.production);
  if (!production.ok) return production;
  const rounds = [];
  for (const r of raw.rounds ?? []) {
    const round = parseAt("fixture round", castRoundSchema, r);
    if (!round.ok) return round;
    rounds.push(round.value);
  }
  const lessons = [];
  for (const l of raw.lessons ?? []) {
    const lesson = parseAt("fixture lesson", productionLessonSchema, l);
    if (!lesson.ok) return lesson;
    lessons.push(lesson.value);
  }
  return ok({ production: production.value, logline: raw.logline, ...(raw.poster === undefined ? {} : { poster: raw.poster }), keptOnly: raw.keptOnly === true, rounds, lessons });
}

export function fixtureProductions(): Result<ProductionsView> {
  const entries: ProductionEntry[] = [];
  for (const raw of SLATE) {
    const e = entryOf(raw);
    if (!e.ok) return err("invalid", e.error.message);
    entries.push(e.value);
  }
  return ok({ entries, ventures: [{ id: "vn-quiet-desk", name: "Quiet Desk" }, { id: "vn-harbour-tales", name: "Harbour Tales" }] });
}
