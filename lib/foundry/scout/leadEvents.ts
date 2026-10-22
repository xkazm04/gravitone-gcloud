// WHAT A SCOUT COMMIT EARNED FOR THE REGISTRY - pure. The Board's apply of a scout packet
// (lib/decision/v1/sources/scout.ts) hands this the night, the cells it keeps and the
// earlier nights its findings restate, and gets back the lead events to queue
// (./leads.ts); the same call over the preview's keeps is the consequence panel's lines,
// so what the commit queues is what it showed. Nothing here reads a disk except
// `readRestated`, whose reader is injected.
//
//   finding-restated  a KEPT finding whose `restates` names a finding an earlier night
//                     kept and committed live. A restatement of something rejected,
//                     undecided, dry or unreadable is not a second observation: no event,
//                     and its PATTERNS line stays n=1 (`verifiedRestates`).
//   source-rich       a source the skill marked `rich` behind any kept cell of the night,
//                     once per URL (the key is the URL, and the queue dedupes by key).
//   style-proven      a catalogue style the commit turns `proven`. NOT REACHABLE from a
//                     scout commit today: its styles go through commitExtractRun, which
//                     writes every kept look as a NEW `candidate` style (a suffixed id past
//                     every other run's), so no keep is ever a style's second cell - only
//                     planForgeCommit promotes (lib/foundry/commitPlan.ts). The producer is
//                     here and takes the promoted styles as data; the scout adapter passes
//                     none until a commit it makes can promote one.
//   genre-publishable a genre's finished piece kept (spark genre-forge, not built): the
//                     typed hook `genreLead` below, with no caller yet. It is where
//                     `mature` enters an event; `lead` then refuses a claim that names
//                     the genre's name or use words, which the evidence carries as the
//                     `genre:` and `use:` lines.

import { leadKey, type LeadEvent } from "./leads";
import { parseCellId, type FindingCandidate, type Night, type NightId } from "./types";

/** An event before the queue stamps it. */
export type LeadDraft = Omit<LeadEvent, "queuedAt" | "filed">;

/** A style a commit promoted to `proven`, with what it was kept on. */
export type ProvenStyle = { readonly id: string; readonly recipe?: string; readonly cells: readonly string[] };

/** A genre whose finished piece was kept (spark genre-forge). Mature: the claim carries craft only. */
export type PublishableGenre = { readonly id: string; readonly name: string; readonly use: string; readonly cells: readonly string[]; readonly mature?: true };

export type LeadInputs = {
  readonly night: Night;
  /** Kept packet cell ids: `night.committed.kept`, or the preview's keeps. */
  readonly kept: Iterable<string>;
  /** The nights this night's findings restate, as read; one that could not be read is absent. */
  readonly earlier: ReadonlyMap<NightId, Night>;
  readonly proven?: readonly ProvenStyle[];
};

/** The evidence prefix of a `genre-publishable` event that `lead` reads its refused words from. */
export const GENRE_LINE = "genre: ";
export const USE_LINE = "use: ";

const RESTATES_RE = /^(\d{4}-\d{2}-\d{2}(?:-\d{1,2})?)\/(c-\d{2,3})$/;

/** `<night>/<candidate>` split, or null for anything else. */
export function parseRestates(ref: string): { readonly night: NightId; readonly candidate: string } | null {
  const m = RESTATES_RE.exec(ref);
  return m === null ? null : { night: m[1] ?? "", candidate: m[2] ?? "" };
}

const urlOf = (n: Night, c: FindingCandidate): string | undefined => n.sources.find((s) => s.id === c.sourceIds[0])?.url;

/** The earlier nights this night's findings name, read through `read`; a night that will not read is left out. */
export async function readRestated(night: Night, read: (id: NightId) => Promise<Night>): Promise<Map<NightId, Night>> {
  const out = new Map<NightId, Night>();
  for (const c of night.candidates) {
    const at = c.kind === "finding" && c.restates !== undefined ? parseRestates(c.restates) : null;
    if (at === null || at.night === night.id || out.has(at.night)) continue;
    try {
      out.set(at.night, await read(at.night));
    } catch {
      /* unreadable: it cannot vouch for a first observation */
    }
  }
  return out;
}

/**
 * By this night's finding id: the earlier finding it restates, when that one was KEPT on a night
 * committed live. Only these get `n=2` and a `finding-restated` event.
 */
export function verifiedRestates(night: Night, earlier: ReadonlyMap<NightId, Night>): Map<string, { readonly night: Night; readonly finding: FindingCandidate }> {
  const out = new Map<string, { readonly night: Night; readonly finding: FindingCandidate }>();
  for (const c of night.candidates) {
    const at = c.kind === "finding" && c.restates !== undefined ? parseRestates(c.restates) : null;
    const was = at === null ? undefined : earlier.get(at.night);
    if (at === null || was?.committed === undefined || was.committed.dry || !was.committed.kept.includes(`${at.candidate}/text`)) continue;
    const f = was.candidates.find((x) => x.id === at.candidate);
    if (f?.kind === "finding") out.set(c.id, { night: was, finding: f });
  }
  return out;
}

/** The events a commit keeping `kept` earns, in the night's candidate order; none twice. */
export function leadEventsOf(i: LeadInputs): LeadDraft[] {
  const n = i.night;
  const kept = [...i.kept];
  const keptOf = (cid: string): string[] => kept.filter((cell) => parseCellId(cell)?.candidate === cid);
  const out: LeadDraft[] = [];
  const add = (e: LeadDraft): void => {
    if (!out.some((x) => x.key === e.key)) out.push(e);
  };
  for (const s of i.proven ?? []) {
    add({ key: leadKey("style-proven", s.id), kind: "style-proven", night: n.id, refs: [s.id], evidence: [...s.cells.map((c) => `kept: ${c}`), ...(s.recipe === undefined ? [] : [`recipe: ${s.recipe.split(/[;,.]/)[0]?.trim() ?? s.recipe}`])] });
  }
  const restated = verifiedRestates(n, i.earlier);
  for (const c of n.candidates) {
    const was = c.kind === "finding" && keptOf(c.id).length > 0 ? restated.get(c.id) : undefined;
    if (c.kind !== "finding" || was === undefined) continue;
    const ref = `${n.id}/${c.id}`;
    const first = `${was.night.id}/${was.finding.id}`;
    const said = (at: string, f: FindingCandidate, url: string | undefined): string[] => [`claim (${at}): ${f.claim}`, `quote (${at}): "${f.quote}"`, ...(url === undefined ? [] : [`source (${at}): ${url}`])];
    add({ key: leadKey("finding-restated", ref), kind: "finding-restated", night: n.id, refs: [ref, first], evidence: [...said(first, was.finding, urlOf(was.night, was.finding)), ...said(ref, c, urlOf(n, c))] });
  }
  for (const s of n.sources) {
    if (s.rich === undefined) continue;
    const behind = n.candidates.filter((c) => c.sourceIds.includes(s.id)).flatMap((c) => keptOf(c.id));
    if (behind.length === 0) continue;
    add({ key: leadKey("source-rich", s.url), kind: "source-rich", night: n.id, refs: [s.url], evidence: [`rich: ${s.rich}`, `source: ${s.url} (${s.title})`, ...behind.map((c) => `kept: ${c}`)] });
  }
  return out;
}

/** The packet cell a consequence line hangs an event on: its first kept cell, a restating finding's text cell. */
export function leadCell(e: LeadDraft): string | undefined {
  if (e.kind === "finding-restated") return `${e.refs[0]?.split("/").at(-1) ?? ""}/text`;
  return e.evidence.find((l) => l.startsWith("kept: "))?.slice("kept: ".length);
}

/** The genre-forge's hook: the event its publishable verdict queues. No caller until the forge exists. */
export function genreLead(night: NightId, g: PublishableGenre): LeadDraft {
  return { key: leadKey("genre-publishable", g.id), kind: "genre-publishable", night, refs: [g.id], evidence: [`${GENRE_LINE}${g.name}`, `${USE_LINE}${g.use}`, ...g.cells.map((c) => `kept: ${c}`)], ...(g.mature === true ? { mature: true as const } : {}) };
}
