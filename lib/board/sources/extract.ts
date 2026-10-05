// EXTRACT — styles read off a gallery, one row per style, kept or rejected.
//
// Same seams as the /foundry Extract tab (app/foundry/extractClient.ts) and the
// same whole-map PUT, so the same read-fresh-then-write discipline as the cull.
// An extract commit is not destructive (lib/foundry/extract/store.ts header),
// but it is still the Foundry's to perform: the Board decides, it does not
// write the catalogue.
//
// Media: a source the style was read from, then its last replica round and its
// first transfer — what the human compares. Machine pick: the replica and
// transfer scores and any near-duplicate the engine flagged, hidden until the
// human decides.

import { extractFileUrl, fetchExtractRun, fetchExtractRuns, saveExtractVerdicts } from "@/app/foundry/extractClient";
import type { ExtractDetail, ExtractedStyle } from "@/lib/foundry/extract/types";

import type { BoardEntry, BoardSourceExt } from "../source";
import { itemId, itemsOf, keyOfItem, SourceUnavailable } from "../source";
import type { BoardMedia, BoardVerdict } from "../types";
import { fromKeep, withExtractVerdict } from "../verdicts";
import { pct, read } from "./foundryErrors";

const SEP = "::";
const keyFor = (run: string, sid: string) => `${run}${SEP}${sid}`;
function split(key: string): { run: string; sid: string } {
  const at = key.indexOf(SEP);
  if (at < 0) throw new SourceUnavailable(`Not an extract key: ${key}`);
  return { run: key.slice(0, at), sid: key.slice(at + SEP.length) };
}

function lastRound(style: ExtractedStyle) {
  for (const r of style.replicas) {
    const done = [...r.rounds].reverse().find((x) => x.file);
    if (done) return done;
  }
  return null;
}

function entriesOf(detail: ExtractDetail): BoardEntry[] {
  const { run, verdicts } = detail;
  const sourceById = new Map(run.sources.map((s) => [s.id, s]));
  return run.styles.map((style): BoardEntry => {
    const media: BoardMedia[] = [];
    const src = style.members.map((m) => sourceById.get(m)).find((s) => s?.file);
    if (src) media.push({ kind: "image", src: extractFileUrl(run.id, src.file) });
    const round = lastRound(style);
    if (round?.file) media.push({ kind: "image", src: extractFileUrl(run.id, round.file) });
    const transfer = style.transfers.find((t) => t.file);
    if (transfer?.file) media.push({ kind: "image", src: extractFileUrl(run.id, transfer.file) });
    media.push({ kind: "text", text: style.recipe });

    const transfers = style.transfers.map((t) => t.score).filter((s): s is number => typeof s === "number");
    const meanTransfer = transfers.length ? transfers.reduce((a, b) => a + b, 0) / transfers.length : null;
    const pickParts = [`replica ${pct(round?.score)}`, `transfer ${pct(meanTransfer)}`];
    if (style.similar_to?.length) pickParts.push(`near ${style.similar_to.join(", ")}`);

    return {
      item: {
        id: itemId("extract", keyFor(run.id, style.id)),
        source: "extract",
        title: style.name,
        projectId: null,
        group: run.id,
        media,
        machinePick: pickParts.join(" · "),
        verdict: fromKeep(verdicts[style.id]),
        reasons: [],
        note: null,
        createdAt: run.created,
      },
      href: "/foundry",
      facts: [
        { name: "family", value: style.family },
        { name: "sources", value: String(style.members.length) },
        { name: "run", value: run.slug },
      ],
      refuse: {},
    };
  });
}

export function makeExtractSource(): BoardSourceExt {
  const loadEntries = async (): Promise<BoardEntry[]> => {
    const runs = await read(fetchExtractRuns);
    const open = runs.filter((r) => r.status !== "committed" && r.styles > 0);
    const details = await Promise.all(open.map((r) => read(() => fetchExtractRun(r.id))));
    return details.flatMap(entriesOf);
  };
  return {
    id: "extract",
    label: "Extract",
    reasonAxes: [],
    native: { href: "/foundry", label: "Foundry · Extract" },
    exclusive: false,
    commitsOn: { href: "/foundry", label: "commit on Foundry" },
    async count() {
      const runs = await read(fetchExtractRuns);
      const open = runs.filter((r) => r.status !== "committed");
      const total = open.reduce((s, r) => s + r.styles, 0);
      const decided = open.reduce((s, r) => s + r.decided, 0);
      const kept = open.reduce((s, r) => s + r.kept, 0);
      return { total, pending: total - decided, decided, rejected: decided - kept };
    },
    loadEntries,
    load: () => itemsOf(loadEntries()),
    async decide(id: string, verdict: BoardVerdict) {
      const { run, sid } = split(keyOfItem(id));
      const fresh = await read(() => fetchExtractRun(run));
      await saveExtractVerdicts(run, withExtractVerdict(fresh.verdicts, sid, verdict));
    },
  };
}

export const __extractEntries = entriesOf;
