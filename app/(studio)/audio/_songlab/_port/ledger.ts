import "server-only";

// THE SONG LAB'S PORT, LEDGER SIDE (spark yue2-song-lab S2): the live desk. The draw and its bracket
// are lib/yue2/draw.ts (`draws`, `bracketOf`: draw versions, knockout pairs and votes folded); the
// takes and their scores lib/yue2/lab.ts `labTakes`; the votes and sides lib/yue2/ab.ts
// `judgedPairs`; the agent's room lib/yue2/labRelay.ts `labThread` with lib/yue2/proposals.ts
// `decisions`; presence the studio's (studio/_live/presence.ts, `presenceOf` over the act token);
// the GPU lane's song-lab jobs the kernel's job list. ./build.ts turns it into what the browser sees.
//
// EVERY REFUSAL IS SAID. A module that answers `unavailable` - a draw or a relay not built yet, a
// store that cannot be read - is carried in `unavailable` with its sentence verbatim, and the part
// it would have filled stays absent (no draw tabs, no line), never a made-up quiet lab.
import { existsSync } from "node:fs";

import { list as listJobs } from "@gt/kernel/job";
import type { Store } from "@gt/kernel/store";
import type { DrawTabView, FieldTakeView, JobRowView } from "@gt/ui/components/songlab/songlab.ts";

import { kernel } from "../../../../../lib/kernelStore.ts";
import { abWindowPath } from "../../../../../lib/producers/yue2Acts.ts";
import { readTakes } from "../../../../../lib/sound/store.ts";
import { DEFECTS } from "../../../../../lib/sound/types.ts";
import { judgedPairs } from "../../../../../lib/yue2/ab.ts";
import { bracketOf, draws as listDraws, type Bracket } from "../../../../../lib/yue2/draw.ts";
import { labTakes, REFERENCE_USE } from "../../../../../lib/yue2/lab.ts";
import { labThread } from "../../../../../lib/yue2/labRelay.ts";
import { decisions as readDecisions } from "../../../../../lib/yue2/proposals.ts";
import { readPresence } from "../../studio/_live/presence.ts";
import { deskOf, type Judged } from "./build.ts";
import { directorOf } from "./director.ts";
import type { SongLabPort, SongLabRead, SongLabUrl, Unavailable } from "./port.ts";
import { fieldRows, headOf, drawNameOf } from "./shape.ts";
import { gateOf, type LabEntry } from "./words.ts";

/** The most lab takes one read lists (bounded-enumeration; the lab holds tens to hundreds). */
export const LAB_READ_MAX = 1000;
const ACTIVE = new Set(["queued", "running", "paused"]);
const PRODUCER_WORD: Readonly<Record<string, string>> = { "yue2-render": "render", "yue2-score": "score", "yue2-post": "post" };

const cut = (pairId: string): boolean => existsSync(abWindowPath(pairId, "a")) && existsSync(abWindowPath(pairId, "b"));

function jobsOf(store: Store, gaps: Unavailable[]): JobRowView[] {
  const r = listJobs(store, { lane: "gpu.local" });
  if (!r.ok) {
    gaps.push({ part: "jobs", message: r.error.message });
    return [];
  }
  return r.value
    .filter((j) => j.producer.startsWith("yue2-") && ACTIVE.has(j.state))
    .map((j) => ({ id: j.id, label: `${PRODUCER_WORD[j.producer] ?? j.producer} · ${j.id.replace(/^job:yue2-[a-z]+:/, "")}`, state: j.state, done: j.progress.done, total: j.progress.total, ...(j.progress.stage === undefined ? {} : { stage: j.progress.stage }) }));
}

async function referencesOf(gaps: Unavailable[]): Promise<string[]> {
  try {
    return (await readTakes()).takes.filter((t) => t.use === REFERENCE_USE).map((t) => t.title);
  } catch (e) {
    gaps.push({ part: "references", message: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

/** The live read over one kernel store (the seam the tests drive with a temp store). */
export async function readLedger(store: Store, url: SongLabUrl, presence: "listening" | "nobody"): Promise<SongLabRead> {
  const gaps: Unavailable[] = [];
  const lab = await labTakes(store, LAB_READ_MAX);
  if (!lab.ok) gaps.push({ part: "takes", message: lab.error.message });
  const takes = new Map<string, LabEntry>((lab.ok ? lab.value : []).map((t) => [t.takeId, { takeId: t.takeId, title: t.title, facts: t.facts, ...(t.scores === undefined ? {} : { scores: t.scores }), durationS: t.facts.durationS }]));

  const all = listDraws(store);
  if (!all.ok) gaps.push({ part: "draw", message: all.error.message });
  const brackets = new Map<string, Bracket>();
  for (const d of all.ok ? all.value : []) {
    const b = await bracketOf(store, d.drawId);
    if (b.ok) brackets.set(d.drawId, b.value);
    else gaps.push({ part: "draw", message: b.error.message });
  }
  const drawId = url.draw !== undefined && brackets.has(url.draw) ? url.draw : [...brackets.keys()][0];
  const open = drawId === undefined ? undefined : brackets.get(drawId);

  const judged = new Map<string, Judged>();
  const jp = judgedPairs(store);
  if (jp.ok) for (const j of jp.value) judged.set(j.pair.pairId, { pair: j.pair, vote: j.vote });
  else gaps.push({ part: "votes", message: jp.error.message });

  const desk = open === undefined ? undefined : deskOf({ bracket: open, drawName: drawNameOf(open.draw, takes), takes, judged, windowCut: cut, ...(url.match === undefined ? {} : { selected: url.match }) });
  const tabs: DrawTabView[] = [...brackets.values()].map((b) => {
    const v = deskOf({ bracket: b, drawName: drawNameOf(b.draw, takes), takes, judged, windowCut: () => false }).bracket;
    return { drawId: b.draw.drawId, name: drawNameOf(b.draw, takes), open: v.open, decided: v.decided, total: v.total };
  });

  const thread = labThread(store);
  // No lab session yet is the quiet room (no direction given), not a refusal.
  if (!thread.ok && thread.error.code !== "not-found") gaps.push({ part: "relay", message: thread.error.message });
  const dec = readDecisions(store);
  if (!dec.ok) gaps.push({ part: "proposals", message: dec.error.message });
  const seeds = [...takes.values()].filter((t) => t.facts.lineage.sourceTakeId === undefined);
  const director = directorOf({
    presence,
    says: thread.ok ? thread.value.says : [],
    turns: thread.ok ? thread.value.turns : [],
    decisions: dec.ok ? dec.value : {},
    figures: {
      takes: takes.size,
      pass: seeds.filter((t) => gateOf(t.scores) === "pass").length,
      seeded: open?.draw.entrants.length ?? 0,
      cut: open?.draw.cut?.length ?? 0,
      decided: desk?.bracket.decided ?? 0,
      upsets: desk?.bracket.upsets ?? 0,
    },
  });
  let field: { takes: FieldTakeView[]; references: string[] } | undefined;
  if (url.field) field = { takes: fieldRows([...takes.values()], open?.draw), references: await referencesOf(gaps) };

  return {
    source: "live",
    unavailable: gaps,
    director,
    draws: tabs,
    ...(open === undefined ? {} : { drawId: open.draw.drawId, head: headOf(open.draw, takes) }),
    ...(desk === undefined ? {} : { bracket: desk.bracket }),
    next: desk?.next ?? [],
    ...(desk?.glow === undefined ? {} : { glow: desk.glow }),
    ...(url.match === undefined ? {} : { selected: url.match }),
    ...(desk?.match === undefined ? {} : { match: desk.match }),
    ...(desk?.reveal === undefined ? {} : { reveal: desk.reveal }),
    jobs: jobsOf(store, gaps),
    ...(field === undefined ? {} : { field }),
    defects: DEFECTS,
    open: desk?.bracket.open ?? 0,
  };
}

export const ledgerPort: SongLabPort = {
  read: async (url) => {
    const k = kernel();
    if (!k.ok) {
      return { source: "live", unavailable: [{ part: "store", message: k.error.message }], director: directorOf({ presence: "nobody", says: [], turns: [], decisions: {}, figures: { takes: 0, pass: 0, seeded: 0, cut: 0, decided: 0, upsets: 0 } }), draws: [], next: [], jobs: [], defects: DEFECTS, open: 0 };
    }
    return readLedger(k.value.store, url, readPresence());
  },
};
