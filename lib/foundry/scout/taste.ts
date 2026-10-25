import type { LoadResource, LoadSummary } from "@gt/domain/load";

import { developedOf } from "./direction";
import { alreadyDrawn } from "./ideaRepeat";
import { ancestryOf, listSeedBatches, seedOf } from "./seedStore";
import { seedFacets } from "./seeds";
import { EMPTY_STEER, pausedUnder, readSteer } from "./steer";
import { listNights, readAllNights, readNight } from "./store";
import { storyboardSections } from "./storyboardKept";
import { museSections } from "./tasteMuse";
import { CANDIDATE_KINDS, SEED_AUDIENCES, parseCellId, seedRef, type Candidate, type CandidateKind, type IdeaCandidate, type Night, type SeedBatch, type Steer } from "./types";
import { activeWing } from "./wingScope";

// THE TASTE BRIEF - the operator's last verdicts, written into each new night as
// taste.md for the skill to read before it searches (spark media-training-loop:
// "rejections and their reasons are read back each night"). Terse on purpose: a
// reader that has to wade through it will skim it.
//
// Read from the last TASTE_NIGHTS nights whose packet was COMMITTED and that were
// not dry (a dry night's verdicts were triaged over stand-ins and teach nothing
// about the work). Per night: what was kept and thrown per candidate kind; each
// throw with its reasons (the `scout` source's words) and the operator's note,
// verbatim; and the channels behind what was kept and what was thrown, so a
// channel thrown twice stops being searched.
//
// GAME ASSETS are tallied across the same nights by class and technique - kept, thrown, and the
// reasons each was thrown for - because the question the 3D rounds left open is a comparison
// (operator, 2026-10-22: does T1's budget generation or T2's game-camera design make the better
// hero?), and a comparison is only readable as counts side by side. A cell `c-05/t2` is the
// variant whose id is its technique (lib/producers/scoutAssetActs.ts `plannedVariants`).
//
// DIRECTIONS AND IDEAS (spark scout-idea-artboards WP-I4a) are read off the same nights, each in the
// brief's own words, verbatim: the directions confirmed (what the next nights work inside) and refused;
// the kept ideas no night has developed yet (no source and no candidate names it, ./direction.ts) -
// once one is brought in it drops off the list; the blocked ideas, the bans of the next ideation; and
// the genres kept and blocked, counted, so a night spreads across genres until a direction is set. Then the
// STORYBOARDS (./storyboardKept.ts): kept ideas with none yet, and the kept ones - the roots a full video needs.
//
// SEEDS (spark scout-decision-graph) follow the load, read off every LIVE committed seed batch and the
// steer: the kept seeds still to develop, each with what it lacks (2 child seeds, 1 idea grown from it -
// a seed that has both is not listed), the rejected ones with their reasons and notes (the bans of the
// next batch, newest first, at most SEEDS_BLOCKED_MAX), the branches paused, and kept against rejected
// per audience then genre. Then the `extra` lines a caller hands in (the graph's branches, the tracks to
// visualize), then the nights. Absent entirely while no live batch is committed and nothing is paused.
//
// LAST NIGHT'S LOAD (spark night-load-band) opens the brief: the most recent closed or judged night whose
// window holds load samples (./load.ts), each resource's average and its share in the operator's 60-80%
// band, the minutes work waited and on what, and the one resource that sat longest under the band - the
// scope the next night has room to add. A dry night's box still worked (stand-ins skip the vendors, not
// the probe), so it counts, and is marked dry.

export const TASTE_NIGHTS = 7;

type Verdict = "kept" | "rejected";

/** Which candidate a cell belongs to, and that candidate. */
function candidateOf(n: Night, cell: string): Candidate | undefined {
  const p = parseCellId(cell);
  return p === null ? undefined : n.candidates.find((c) => c.id === p.candidate);
}

function label(n: Night, c: Candidate): string {
  const src = c.sourceIds.map((id) => n.sources.find((s) => s.id === id)).filter((s) => s !== undefined);
  const from = src.map((s) => `${s.title}${s.channel === undefined ? "" : ` (${s.channel})`}`).join("; ");
  switch (c.kind) {
    case "finding":
      return `"${c.claim}" [${c.template}/${c.step}]${from === "" ? "" : ` from ${from}`}`;
    case "watch":
      return `"${c.entry}"`;
    case "asset3d":
      return `"${c.brief.subject}" [${c.brief.class}]`;
    case "idea":
      return `"${c.title}" [${c.target}${c.genre === undefined ? "" : ` · ${c.genre}`}${c.look === undefined ? "" : ` · look: ${c.look}`}]`;
    case "direction":
      return `"${c.title}" [${c.format} · ${c.genre}]`;
    case "storyboard":
      return `"${c.title}" [storyboard of ${c.fromIdea} · ${c.panels.length} frame(s)${c.genre === undefined ? "" : ` · trial of ${c.genre}`}]`;
    case "genre":
      return `"${c.name}" [genre from ${c.fromStoryboard}]`;
    case "venture":
      return `"${c.name}" [${c.ventureKind} venture]`;
    case "piece":
      return `"${c.title}" [piece of ${c.genre}]`;
    default:
      return `${from === "" ? c.id : from}${c.use === undefined ? "" : ` - for ${c.use}`}`;
  }
}

function channelsOf(n: Night, cells: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  const seen = new Set<string>();
  for (const cell of cells) {
    const c = candidateOf(n, cell);
    if (c === undefined || seen.has(c.id)) continue;
    seen.add(c.id);
    for (const id of c.sourceIds) {
      const ch = n.sources.find((s) => s.id === id)?.channel;
      if (ch !== undefined) out.set(ch, (out.get(ch) ?? 0) + 1);
    }
  }
  return out;
}

type Tally = { kept: number; thrown: number; reasons: Map<string, number> };

/** `## Game assets`: kept and thrown by class and technique, each row's throw reasons counted. Empty when no asset was judged. */
export function assetTally(nights: readonly Night[]): string[] {
  const rows = new Map<string, Tally>();
  for (const n of nights) {
    const c = n.committed;
    if (c === undefined) continue;
    for (const [v, cells] of [["kept", c.kept], ["rejected", c.rejected]] as const) {
      for (const cell of cells) {
        const cand = candidateOf(n, cell);
        // The technique leads the variant id (`t2`, a hand-made `t2-a`).
        const technique = /^[tm]\d/i.exec(parseCellId(cell)?.part ?? "")?.[0]?.toUpperCase();
        if (cand?.kind !== "asset3d" || technique === undefined) continue;
        const key = `${cand.brief.class} ${technique}`;
        const t = rows.get(key) ?? { kept: 0, thrown: 0, reasons: new Map<string, number>() };
        if (v === "kept") t.kept += 1;
        else {
          t.thrown += 1;
          for (const r of c.reasons[cell] ?? []) t.reasons.set(r, (t.reasons.get(r) ?? 0) + 1);
        }
        rows.set(key, t);
      }
    }
  }
  if (rows.size === 0) return [];
  const out = ["## Game assets", ""];
  for (const [key, t] of [...rows].sort((a, b) => a[0].localeCompare(b[0]))) {
    const why = [...t.reasons].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([r, k]) => `${r} ${k}`).join(", ");
    out.push(`- ${key}: kept ${t.kept} · thrown ${t.thrown}${why === "" ? "" : ` (${why})`}`);
  }
  out.push("");
  return out;
}

type Judged<C extends Candidate> = { readonly n: Night; readonly c: C; readonly cell: string; readonly reasons: readonly string[]; readonly note?: string };

/** Every judged cell of `kind`, kept or rejected, with its night, reasons and note - newest night first, then the night's order. */
function judgedOf<K extends Candidate["kind"]>(nights: readonly Night[], kind: K, verdict: Verdict): Judged<Extract<Candidate, { kind: K }>>[] {
  return nights.flatMap((n) => {
    const r = n.committed;
    if (r === undefined) return [];
    return (verdict === "kept" ? r.kept : r.rejected).flatMap((cell) => {
      const c = candidateOf(n, cell);
      if (c?.kind !== kind) return [];
      const note = r.notes[cell];
      return [{ n, c: c as Extract<Candidate, { kind: K }>, cell, reasons: r.reasons[cell] ?? [], ...(note === undefined ? {} : { note }) }];
    });
  });
}

const why = (j: Pick<Judged<Candidate>, "reasons" | "note">): string => `${j.reasons.length > 0 ? j.reasons.join(", ") : "no reason given"}${j.note === undefined ? "" : ` - note: ${j.note}`}`;
const none = (xs: readonly string[]): readonly string[] => (xs.length === 0 ? ["- none"] : xs);

/**
 * `## Directions confirmed` / `refused`, `## Ideas to develop` / `blocked`, `## Genres`, over the judged
 * nights. `developed` is every kept idea some night already develops (./direction.ts developedOf).
 */
export function directionsAndIdeas(judged: readonly Night[], developed: ReadonlyMap<string, string>): string[] {
  const confirmed = judgedOf(judged, "direction", "kept").flatMap(({ n, c }) => [
    `- "${c.title}" (${n.id}/${c.id}) · ${c.format} · ${c.genre} · style: ${c.style} · tone: ${c.tone} · audience: ${c.audience}`,
    `  ${c.premise}`,
  ]);
  const refused = judgedOf(judged, "direction", "rejected").map((j) => `- "${j.c.title}" (${j.n.id}/${j.c.id}): ${why(j)}`);
  const kept = judgedOf(judged, "idea", "kept");
  const toDevelop = kept
    .filter(({ n, c }) => !developed.has(`${n.id}/${c.id}`))
    .flatMap(({ n, c }) => [`- ${n.id}/${c.id} · ${c.target} · ${c.genre ?? "-"} · ${c.title}`, `  ${c.prompt}`]);
  const blocked = judgedOf(judged, "idea", "rejected");
  const genres = (js: readonly Judged<IdeaCandidate>[]): string => {
    const by = new Map<string, number>();
    for (const { c } of js) if (c.genre !== undefined) by.set(c.genre, (by.get(c.genre) ?? 0) + 1);
    return [...by].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([g, k]) => `${g} ${k}`).join(", ") || "none";
  };
  return [
    "## Directions confirmed",
    "",
    ...none(confirmed),
    "",
    "## Directions refused",
    "",
    ...none(refused),
    "",
    "## Ideas to develop",
    "",
    ...none(toDevelop),
    "",
    "## Ideas blocked",
    "",
    ...none(blocked.map((j) => `- "${j.c.title}" (${j.n.id}/${j.c.id}): ${why(j)}`)),
    "",
    "## Genres",
    "",
    `- kept: ${genres(kept)}`,
    `- blocked: ${genres(blocked)}`,
    "",
  ];
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;

/** Share of a resource's read strip slots whose mean sat under the band's low mark; undefined when none was read. */
function underShare(r: LoadResource, low: number): number | undefined {
  const read = r.strip.filter((v) => v >= 0);
  return read.length === 0 ? undefined : read.filter((v) => v < low).length / read.length;
}

/** `## Last night's load` for one night's summary. */
export function loadSection(night: Night, s: LoadSummary): string[] {
  const res = (["cpu", "ram", "gpu"] as const).map((k) => (s[k].read === 0 ? `${k} unread` : `${k} avg ${pct(s[k].avg)} (${pct(s[k].inBand)} in band)`));
  const waited = Object.entries(s.waited).filter(([, m]) => m !== undefined && m > 0).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0) || a[0].localeCompare(b[0])).map(([r, m]) => `${r} ${Math.round(m ?? 0)} min`);
  const hours = ((s.toMs - s.fromMs) / 3_600_000).toFixed(1);
  const under = (["cpu", "ram", "gpu"] as const).flatMap((k) => {
    const u = underShare(s[k], s.band.low);
    return u === undefined ? [] : [{ k, u }];
  }).sort((a, b) => b.u - a.u)[0];
  const low = pct(s.band.low);
  return [
    "## Last night's load",
    "",
    `- ${night.id}${night.dry ? " (dry)" : ""} · ${hours} h · ${s.samples} samples · band ${Math.round(s.band.low * 100)}-${pct(s.band.high)}`,
    `- ${[...res, ...(waited.length === 0 ? [] : [`waited: ${waited.join(" · ")}`])].join(" · ")}`,
    `- ${under === undefined || under.u === 0 ? `nothing under ${low}` : `${under.k} under ${low} for ${pct(under.u)} of the night`}`,
    "",
  ];
}

/** A night's load, as the brief is handed it: the night and its summary. */
export type NightLoad = { readonly night: Night; readonly load: LoadSummary };

/* ── seeds ─────────────────────────────────────────────────────────────────── */

/** The rejected seeds the brief lists, newest first: the bans a batch of ~100 is written against. */
export const SEEDS_BLOCKED_MAX = 200;
/** A kept seed has its children once it has this many. */
export const SEED_CHILDREN_WANTED = 2;

/** What the brief reads besides the nights: the seed batches (newest first) and the steer. */
export type TasteSeeds = { readonly batches: readonly SeedBatch[]; readonly steer: Steer };

type Count = { kept: number; rejected: number };

/**
 * `## Seeds to develop`, `## Seeds blocked`, `## Paused`, `## Seed genres` over every live committed batch.
 * A child seed counts toward its parent from any batch but a dry one; an idea counts from any night but a dry one.
 */
export function seedSections(nights: readonly Night[], { batches, steer }: TasteSeeds): string[] {
  const live = batches.filter((b) => b.committed !== undefined && !b.dry && !b.committed.dry);
  if (live.length === 0 && steer.paused.length === 0) return [];
  const children = new Map<string, number>();
  for (const b of batches) if (!b.dry) for (const s of b.seeds) if (s.parent !== undefined) children.set(s.parent, (children.get(s.parent) ?? 0) + 1);
  const ideas = new Set(nights.filter((n) => !n.dry).flatMap((n) => n.candidates.flatMap((c) => (c.kind === "idea" && c.fromSeed !== undefined ? [c.fromSeed] : []))));
  const develop: string[] = [];
  const blocked: string[] = [];
  const genres = new Map<string, Map<string, Count>>();
  for (const b of live) {
    const c = b.committed;
    if (c === undefined) continue;
    for (const s of b.seeds) {
      const ref = seedRef(b.id, s.id);
      const kept = c.kept.includes(s.id);
      const rejected = c.rejected.includes(s.id);
      if (kept || rejected) {
        const by = genres.get(s.audience) ?? new Map<string, Count>();
        const t = by.get(s.genre) ?? { kept: 0, rejected: 0 };
        if (kept) t.kept += 1;
        else t.rejected += 1;
        by.set(s.genre, t);
        genres.set(s.audience, by);
      }
      if (kept && pausedUnder(steer, ancestryOf(batches, ref)) === undefined) {
        const needs = [...((children.get(ref) ?? 0) < SEED_CHILDREN_WANTED ? ["child seeds"] : []), ...(ideas.has(ref) ? [] : ["ideas"])];
        if (needs.length > 0) develop.push(`- ${ref} · ${seedFacets(s)} (needs: ${needs.join(", ")}) — ${s.sentence}`);
      }
      if (rejected && blocked.length < SEEDS_BLOCKED_MAX) {
        const reasons = c.reasons[s.id] ?? [];
        const note = c.notes[s.id];
        blocked.push(`- "${s.sentence}" · ${reasons.length > 0 ? reasons.join(", ") : "no reason given"}${note === undefined ? "" : ` · note: ${note}`}`);
      }
    }
  }
  const paused = steer.paused.map((ref) => `- ${ref} — ${seedOf(batches, ref)?.seed.sentence ?? "no such seed on disk"}`);
  const count = (t: Count): string => `kept ${t.kept} · rejected ${t.rejected}`;
  const sum = (by: Map<string, Count>): Count => [...by.values()].reduce((a, t) => ({ kept: a.kept + t.kept, rejected: a.rejected + t.rejected }), { kept: 0, rejected: 0 });
  const genreLines = SEED_AUDIENCES.flatMap((a) => {
    const by = genres.get(a);
    if (by === undefined) return [];
    return [`- ${a}: ${count(sum(by))}`, ...[...by].sort((x, y) => x[0].localeCompare(y[0])).map(([g, t]) => `  - ${g}: ${count(t)}`)];
  });
  return ["## Seeds to develop", "", ...none(develop), "", "## Seeds blocked", "", ...none(blocked), "", "## Paused", "", ...none(paused), "", "## Seed genres", "", ...none(genreLines), ""];
}

export type TasteOptions = {
  /** The seed batches and the steer; absent: no seed section. */
  readonly seeds?: TasteSeeds;
  /**
   * Lines a caller adds after the seed sections, whole sections with their own headings - the slot the graph's
   * `branchesSection` (./graph.ts) and the tracks' `tracksSection` (./track.ts) are wired into.
   */
  readonly extra?: readonly string[];
};

/** The brief for nights already read (pure; `tasteBrief` reads them). Nights not committed only say which kept ideas are developed. */
export function tasteOf(nights: readonly Night[], last?: NightLoad, o: TasteOptions = {}): string {
  const judged = nights.filter((n) => n.committed !== undefined && !n.dry && !n.committed.dry).slice(0, TASTE_NIGHTS);
  const lines = ["# Taste", "", ...(last === undefined ? [] : loadSection(last.night, last.load)), ...(o.seeds === undefined ? [] : seedSections(nights, o.seeds)), ...(o.extra ?? [])];
  if (judged.length === 0) return [...lines, "No committed live night yet: nothing kept or thrown to learn from.", ""].join("\n");
  const kept = new Map<string, number>();
  const thrown = new Map<string, number>();
  for (const n of judged) {
    const c = n.committed;
    if (c === undefined) continue;
    lines.push(`## ${n.id} (committed ${c.at.slice(0, 10)} by ${c.by})`, "");
    const counts = (cells: readonly string[]): Record<CandidateKind, number> => {
      const by = Object.fromEntries(CANDIDATE_KINDS.map((k) => [k, 0])) as Record<CandidateKind, number>;
      for (const cell of cells) {
        const cand = candidateOf(n, cell);
        if (cand !== undefined) by[cand.kind] += 1;
      }
      return by;
    };
    for (const [v, cells] of [["kept", c.kept], ["rejected", c.rejected]] as const satisfies readonly (readonly [Verdict, readonly string[]])[]) {
      const by = counts(cells);
      lines.push(`- ${v}: ${CANDIDATE_KINDS.filter((k) => by[k] > 0).map((k) => `${by[k]} ${k}`).join(", ") || "none"}`);
    }
    for (const cell of c.kept) {
      const note = c.notes[cell];
      const cand = candidateOf(n, cell);
      if (note !== undefined && cand !== undefined) lines.push(`  - kept ${cand.kind} ${cell} ${label(n, cand)} - note: ${note}`);
    }
    for (const cell of c.rejected) {
      const cand = candidateOf(n, cell);
      if (cand === undefined) continue;
      const reasons = c.reasons[cell] ?? [];
      const note = c.notes[cell];
      lines.push(`  - threw ${cand.kind} ${cell} ${label(n, cand)}: ${reasons.length > 0 ? reasons.join(", ") : "no reason given"}${note === undefined ? "" : ` - note: ${note}`}`);
    }
    for (const [ch, k] of channelsOf(n, c.kept)) kept.set(ch, (kept.get(ch) ?? 0) + k);
    for (const [ch, k] of channelsOf(n, c.rejected)) thrown.set(ch, (thrown.get(ch) ?? 0) + k);
    lines.push("");
  }
  const list = (m: Map<string, number>): string =>
    [...m]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([ch, k]) => `${ch} ${k}`)
      .join(", ") || "none";
  // The uses the operator kept, and the ones refused AS uses (the `use case` reason): a direction
  // refused that way is not tried again until something new makes it worth it.
  const uses = (pred: (n: Night, cell: string) => boolean): string[] => [
    ...new Set(
      nights.flatMap((n) => {
        const c = n.committed;
        if (c === undefined || c.dry) return [];
        return [...c.kept, ...c.rejected].filter((cell) => pred(n, cell)).flatMap((cell) => {
          const u = candidateOf(n, cell)?.use;
          return u === undefined ? [] : [u];
        });
      }),
    ),
  ];
  const keptUses = uses((n, cell) => n.committed?.kept.includes(cell) === true);
  const refusedUses = uses((n, cell) => (n.committed?.reasons[cell] ?? []).includes("use case"));
  lines.push(...directionsAndIdeas(judged, developedOf(nights)), ...storyboardSections(judged, nights));
  lines.push("## Uses", "", `- kept: ${keptUses.join("; ") || "none"}`, `- refused as a use: ${refusedUses.join("; ") || "none"}`, "");
  lines.push(...assetTally(judged));
  lines.push("## Channels", "", `- kept: ${list(kept)}`, `- thrown: ${list(thrown)}`);
  const twice = [...thrown].filter(([ch, k]) => k >= 2 && !kept.has(ch)).map(([ch]) => ch);
  if (twice.length > 0) lines.push(`- thrown twice or more, never kept: ${twice.join(", ")}`);
  lines.push("");
  return lines.join("\n");
}

/**
 * Read every night on disk, newest first, and write the brief. An unreadable night is skipped. Uncommitted nights are read
 * too: their sources say which kept ideas are already developed. `loadOf` reads a night's load (./load.ts nightLoad over the
 * caller's store); the newest closed or committed night it finds samples for, among the last TASTE_NIGHTS such, opens the brief.
 * The seed batches and the steer are read too (a steer mid-write reads as empty: the brief is advice); `extra` is
 * TasteOptions.extra. Every read is the active wing's root; the muse wing's brief opens its extra with its kept
 * characters and technique findings (./tasteMuse.ts).
 */
export async function tasteBrief(except?: string, loadOf?: (n: Night) => LoadSummary | undefined, extra?: readonly string[]): Promise<string> {
  const nights: Night[] = [];
  for (const s of await listNights()) {
    if (s.id === except) continue;
    try {
      nights.push(await readNight(s.id));
    } catch {
      /* a manifest mid-write or damaged: its verdicts wait for the next night */
    }
  }
  let last: NightLoad | undefined;
  for (const night of loadOf === undefined ? [] : nights.filter((n) => n.state !== "open").slice(0, TASTE_NIGHTS)) {
    const load = loadOf?.(night);
    if (load !== undefined) {
      last = { night, load };
      break;
    }
  }
  const seeds: TasteSeeds = { batches: await listSeedBatches(), steer: await readSteer().catch(() => EMPTY_STEER) };
  // Every night on disk, the open and the uncommitted too: a card thrown last night is a name the next author must not draw again.
  const all = [...(activeWing() === "muse" ? [...(await museSections()), ...alreadyDrawn(await readAllNights())] : []), ...(extra ?? [])];
  return tasteOf(nights, last, { seeds, ...(all.length === 0 ? {} : { extra: all }) });
}
