// CULL — the forge's candidates, one per plate, kept or rejected by hand.
//
// Reads through the same seams the /foundry cull uses (app/foundry/
// foundryClient.ts) and writes through `saveVerdicts`, which PUTs the WHOLE map
// (app/api/foundry/runs/[id]/verdicts/route.ts: "whole-map on purpose"). So a
// decide is read-fresh → change one key → write, never a write from a map the
// Board loaded minutes ago: the /foundry tab may have autosaved since.
//
// Committed runs are left out. Their verdicts are final (store.ts putVerdicts
// answers 409) and the Board decides, it does not revisit history.
//
// Machine pick: the grader's craft and style scores. Hidden by the surface
// until the human has decided, which is the point of carrying it separately.

import { fetchRun, fetchRuns, fileUrl, saveVerdicts } from "@/app/foundry/foundryClient";
import type { Candidate, RunDetail } from "@/lib/foundry/types";

import type { BoardEntry, BoardSourceExt } from "../source";
import { itemId, itemsOf, keyOfItem, SourceUnavailable } from "../source";
import type { BoardVerdict } from "../types";
import { decodeNote, fromKeep, withCullVerdict } from "../verdicts";
import { pct, read } from "./foundryErrors";

const READY = new Set<Candidate["status"]>(["graded", "unmeasured", "generated"]);
const SEP = "::";

/** A cull key is `<run>::<candidate id>` — candidate ids carry slashes, run ids never `::`. */
const keyFor = (run: string, cid: string) => `${run}${SEP}${cid}`;
function split(key: string): { run: string; cid: string } {
  const at = key.indexOf(SEP);
  if (at < 0) throw new SourceUnavailable(`Not a cull key: ${key}`);
  return { run: key.slice(0, at), cid: key.slice(at + SEP.length) };
}

function entriesOf(detail: RunDetail): BoardEntry[] {
  const { run, verdicts } = detail;
  return run.candidates
    .filter((c) => !c.deleted && READY.has(c.status))
    .map((c): BoardEntry => {
      const rec = verdicts[c.id];
      const { reasons, note } = decodeNote(rec?.note);
      const style = run.styles[c.style]?.name ?? c.style;
      const g = c.grade;
      const pick = g ? `craft ${pct(g.craft?.score)} · style ${pct(g.style?.score)}${g.veto?.has_text ? " · text veto" : ""}` : null;
      return {
        item: {
          id: itemId("cull", keyFor(run.id, c.id)),
          source: "cull",
          title: `${style} · ${c.mechanism}`,
          projectId: null,
          group: run.id,
          media: [{ kind: "image", src: fileUrl(run.id, c.file) }],
          machinePick: pick,
          verdict: fromKeep(rec),
          reasons: rec?.verdict === "reject" ? reasons : [],
          note,
          createdAt: run.created,
        },
        href: "/foundry",
        facts: [
          { name: "scene", value: c.scene },
          { name: "seed", value: String(c.seed) },
          { name: "run", value: run.id },
        ],
        refuse: {},
      };
    });
}

export function makeCullSource(): BoardSourceExt {
  const loadEntries = async (): Promise<BoardEntry[]> => {
    const runs = await read(fetchRuns);
    const open = runs.filter((r) => r.status !== "committed" && r.candidates > 0);
    const details = await Promise.all(open.map((r) => read(() => fetchRun(r.id))));
    return details.flatMap(entriesOf);
  };
  return {
    id: "cull",
    label: "Cull",
    reasonAxes: ["style", "subject"],
    native: { href: "/foundry", label: "Foundry · Cull" },
    exclusive: false,
    commitsOn: { href: "/foundry", label: "commit on Foundry" },
    async count() {
      const runs = await read(fetchRuns);
      const open = runs.filter((r) => r.status !== "committed");
      // From the summaries alone: `candidates` counts plates not yet drawn, so
      // pending is an upper bound until the items are loaded — and the
      // registry replaces it with the exact figure the moment they are.
      const total = open.reduce((s, r) => s + r.candidates, 0);
      const decided = open.reduce((s, r) => s + r.decided, 0);
      const kept = open.reduce((s, r) => s + r.kept, 0);
      return { total, pending: total - decided, decided, rejected: decided - kept };
    },
    loadEntries,
    load: () => itemsOf(loadEntries()),
    async decide(id: string, verdict: BoardVerdict, reasons: string[] = [], note?: string) {
      const { run, cid } = split(keyOfItem(id));
      const fresh = await read(() => fetchRun(run));
      // A note the Board did not author survives a Board decision.
      const kept = note ?? decodeNote(fresh.verdicts[cid]?.note).note;
      const next = withCullVerdict(fresh.verdicts, cid, verdict, reasons, kept);
      await saveVerdicts(run, next);
    },
  };
}

/** Exported for the probe: entries from one run detail, no network. */
export const __cullEntries = entriesOf;
export const __cullKey = { keyFor, split };
