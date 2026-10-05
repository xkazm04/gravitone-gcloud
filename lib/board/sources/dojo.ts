// DOJO — the training loop's claimed improvements, approved or rejected by hand.
//
// foundry-out/training/<id>/verdicts.json is already approve | reject | null
// per improvement id (lib/foundry/training/types.ts), written whole through
// `saveTrainingVerdicts`. Read fresh, change one key, write.
//
// THE MACHINE PICK IS HIDDEN UNTIL THE HUMAN DECIDES. app/foundry/DojoView.tsx
// draws `pair.judge_pick` on every duo (DojoView.tsx:486) BEFORE the human has
// judged, which anchors the human on the judge — and the human verdict is the
// calibration record the judge is scored against (training/store.ts
// findingsMarkdown: "human vs judge"). A human who saw the judge first is not
// an independent measurement. So the Board carries the judge's pick rate as
// `machinePick` and the surface reveals it only after a verdict.
//
// REASONS ARE SESSION-ONLY HERE. The Board's reject axes for the dojo are
// technique / execution, and `TrainingVerdicts` has no field for them: the
// writer stores a bare verdict per id. They are held in this module for the
// session so the surface can show what was chosen, and they do not survive a
// reload. Recorded as a request against lib/foundry/training/types.ts rather
// than smuggled into another file.

import { fetchTrainingCycle, fetchTrainingCycles, fileUrl, saveTrainingVerdicts } from "@/app/foundry/foundryClient";
import type { TrainingCycleDetail } from "@/lib/foundry/training/types";

import type { BoardEntry, BoardSourceExt } from "../source";
import { itemId, itemsOf, keyOfItem, SourceUnavailable } from "../source";
import type { BoardMedia, BoardVerdict } from "../types";
import { fromTraining, toTraining } from "../verdicts";
import { read } from "./foundryErrors";

const SEP = "::";
const keyFor = (cycle: string, iid: string) => `${cycle}${SEP}${iid}`;
function split(key: string): { cycle: string; iid: string } {
  const at = key.indexOf(SEP);
  if (at < 0) throw new SourceUnavailable(`Not a dojo key: ${key}`);
  return { cycle: key.slice(0, at), iid: key.slice(at + SEP.length) };
}

const sessionReasons = new Map<string, string[]>();

function entriesOf(detail: TrainingCycleDetail): BoardEntry[] {
  const { cycle, verdicts } = detail;
  return cycle.improvements.map((imp): BoardEntry => {
    const id = itemId("dojo", keyFor(cycle.id, imp.id));
    const media: BoardMedia[] = [];
    const pair = imp.pairs[0];
    for (const ref of pair ? [pair.baseline, pair.challenger] : []) {
      if (ref.deleted) continue;
      media.push({ kind: "image", src: fileUrl(cycle.id, ref.poster ?? ref.file, "training") });
    }
    media.push({ kind: "text", text: imp.claim });
    const n = imp.pairs.length;
    const challenger = imp.pairs.filter((p) => p.judge_pick === "challenger").length;
    const verdict = fromTraining(verdicts[imp.id]);
    return {
      item: {
        id,
        source: "dojo",
        title: imp.technique,
        projectId: null,
        group: cycle.id,
        media,
        machinePick: n ? `judge: challenger ${challenger}/${n}` : null,
        verdict,
        reasons: verdict === "reject" ? (sessionReasons.get(id) ?? []) : [],
        note: null,
        createdAt: cycle.at,
      },
      href: "/foundry",
      facts: [
        { name: "subject", value: imp.subject },
        { name: "standard", value: imp.standard },
        { name: "pairs", value: String(n) },
      ],
      refuse: {},
    };
  });
}

export function makeDojoSource(): BoardSourceExt {
  const loadEntries = async (): Promise<BoardEntry[]> => {
    const cycles = await read(fetchTrainingCycles);
    const open = cycles.filter((c) => c.status === "awaiting-gate" && c.improvements > 0);
    const details = await Promise.all(open.map((c) => read(() => fetchTrainingCycle(c.id))));
    return details.flatMap(entriesOf);
  };
  return {
    id: "dojo",
    label: "Dojo",
    reasonAxes: ["technique", "execution"],
    native: { href: "/foundry", label: "Foundry · Dojo" },
    exclusive: false,
    commitsOn: { href: "/foundry", label: "commit on Foundry" },
    async count() {
      const cycles = await read(fetchTrainingCycles);
      const open = cycles.filter((c) => c.status === "awaiting-gate");
      const total = open.reduce((s, c) => s + c.improvements, 0);
      const decided = open.reduce((s, c) => s + c.decided, 0);
      // The summary counts decided, not which way: rejected is unmeasured
      // until the cycles are loaded.
      return { total, pending: total - decided, decided, rejected: null };
    },
    loadEntries,
    load: () => itemsOf(loadEntries()),
    async decide(id: string, verdict: BoardVerdict, reasons: string[] = []) {
      const { cycle, iid } = split(keyOfItem(id));
      const fresh = await read(() => fetchTrainingCycle(cycle));
      await saveTrainingVerdicts(cycle, { ...fresh.verdicts, [iid]: toTraining(verdict) });
      if (verdict === "reject" && reasons.length) sessionReasons.set(id, reasons);
      else sessionReasons.delete(id);
    },
  };
}

export const __dojoEntries = entriesOf;
