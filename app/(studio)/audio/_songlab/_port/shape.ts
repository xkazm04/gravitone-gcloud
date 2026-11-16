// THE DRAW'S NAME, HEAD AND FIELD ROWS (spark yue2-song-lab S2): pure, shared by both sides of the
// port. A main draw is `main draw`; a post draw is named for its raw take (`post · s1`). The head
// says the draw's rules as chips - the main field always under the lyric gate and seeded by
// SongEval unless a rule seeds it otherwise - and names the takes its rules cut.
import { YUE2_RECIPE } from "@gt/domain/audio.yue2";
import type { Draw } from "@gt/domain/audio.yue2.lab";
import type { DrawHeadView, FieldTakeView } from "@gt/ui/components/songlab/songlab.ts";

import { condLine, gateOf, rightsOf, ruleWords, shortLabel, songEvalOf, type LabEntry } from "./words.ts";

export function drawNameOf(d: Draw, takes: ReadonlyMap<string, LabEntry>): string {
  if (d.field === "main") return "main draw";
  const raw = takes.get(d.field.slice("post:".length));
  return raw === undefined ? "post draw" : `post · s${raw.facts.condition.seed}`;
}

export function headOf(d: Draw, takes: ReadonlyMap<string, LabEntry>): DrawHeadView {
  const seedBy = d.rules.find((r) => r.kind === "seed-by");
  // The lyric gate is the base chip already; a rule restating it is not a second chip.
  const gate = (r: (typeof d.rules)[number]) => r.kind === "exclude" && r.metric === "wer" && r.op === "gt" && r.value === YUE2_RECIPE.gateWer;
  const rest = d.rules.filter((r) => r.kind !== "seed-by" && !(d.field === "main" && gate(r))).map(ruleWords);
  const base = d.field === "main" ? `wer ≤ ${Math.round(YUE2_RECIPE.gateWer * 100)}% · ${seedBy === undefined ? "SongEval seeds" : ruleWords(seedBy)}` : `${d.entrants.length} post takes`;
  const cut = (d.cut ?? []).map((id) => {
    const t = takes.get(id);
    return t === undefined ? { label: "a take not in the lab", why: `cut in v${d.version}`, rights: { short: "?", licence: "rights not recorded" } } : { label: shortLabel(t), why: `cut in v${d.version}`, rights: rightsOf(t) };
  });
  return { rules: [base, ...rest], ...(d.field === "main" ? { cut } : {}) };
}

/** Every lab take as a field row, best SongEval first; a take drawn in the open draw carries its seed. */
export function fieldRows(takes: readonly LabEntry[], draw: Draw | undefined): FieldTakeView[] {
  const seeds = new Map((draw?.entrants ?? []).map((e) => [e.takeId, e.seed]));
  return [...takes]
    .sort((a, b) => (songEvalOf(b.scores) ?? -1) - (songEvalOf(a.scores) ?? -1) || a.title.localeCompare(b.title))
    .map((t, i): FieldTakeView => {
      const se = songEvalOf(t.scores);
      const seed = seeds.get(t.takeId);
      return {
        key: String(i),
        label: shortLabel(t),
        cond: condLine(t),
        gate: gateOf(t.scores),
        ...(se === undefined ? {} : { songEval: se }),
        ...(t.scores?.wer === undefined ? {} : { wer: t.scores.wer }),
        ...(t.durationS === undefined ? {} : { durationS: t.durationS }),
        rights: rightsOf(t),
        ...(seed === undefined ? {} : { seed }),
      };
    });
}
