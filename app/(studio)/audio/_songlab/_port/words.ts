// HOW THE KNOCKOUT NAMES A TAKE (the contest winner's labels, from a take's facts): a row's short
// name (`off 1.5 r8 s8`, a post variant's stages), its condition in full (`cot off · cfg 1.5 ·
// rank8 ×0.5 · seed 8`), its rights mark, its gate, and the figures a reveal compares. Pure: both
// sides of the port name takes through here, so a fixture row and a ledger row read alike.
import { YUE2_RECIPE, type SongScores, type Yue2TakeFacts } from "@gt/domain/audio.yue2";
import type { LabRule } from "@gt/domain/audio.yue2.lab";
import type { RightsView } from "@gt/ui/components/songlab/songlab.ts";

/** A take as the desk knows it: its row in the lab, its facts and its newest scores. */
export type LabEntry = { readonly takeId: string; readonly title: string; readonly facts: Yue2TakeFacts; readonly scores?: SongScores; readonly durationS?: number };

const ADAPTER_SHORT: Readonly<Record<string, { readonly row: string; readonly cond: string }>> = {
  hiphop_v2_distilled_rank8: { row: "r8", cond: "rank8" },
  sv_oldschoolhiphop: { row: "old", cond: "oldschool" },
};

const cfgOf = (f: Yue2TakeFacts): string => (f.condition.cfg === undefined ? "def" : f.condition.cfg.toFixed(1));

/** The row's short name. A post variant is its stages; a render is its condition and seed. */
export function shortLabel(e: LabEntry): string {
  const f = e.facts;
  if (f.lineage.sourceTakeId !== undefined) {
    // A variant's own name (`<raw> / v1s_debuzzS_mix_master`) tells a soft debuzz from a heavy one,
    // which the stages alone do not; without one the stages are its name.
    const named = e.title.split(" / ")[1];
    if (named !== undefined && named !== "") return named.replace(/_/g, "·");
    return f.lineage.postStages.length === 0 ? "raw" : f.lineage.postStages.join("·");
  }
  const ad = f.condition.adapter === undefined ? "" : ` ${ADAPTER_SHORT[f.condition.adapter]?.row ?? f.condition.adapter}`;
  return `${f.condition.cot} ${cfgOf(f)}${ad} s${f.condition.seed}`;
}

/** The condition in full. */
export function condLine(e: LabEntry): string {
  const f = e.facts;
  if (f.lineage.sourceTakeId !== undefined) return `${f.lineage.postStages.join("·") || "raw"} · post variant`;
  const c = f.condition;
  const ad = c.adapter === undefined ? "" : ` · ${ADAPTER_SHORT[c.adapter]?.cond ?? c.adapter}${c.adapterStrength === undefined ? "" : ` ×${c.adapterStrength.toFixed(1)}`}`;
  return `cot ${c.cot} · cfg ${cfgOf(f)}${ad} · seed ${c.seed}`;
}

export function rightsOf(e: LabEntry): RightsView {
  const nc = e.facts.rights.licence.includes("NC");
  return { short: nc ? "NC" : "?", licence: e.facts.rights.licence };
}

/** The mean of SongEval's five dimensions; absent when the scorer did not run it. */
export function songEvalOf(s: SongScores | undefined): number | undefined {
  const d = s?.songEval;
  if (d === undefined) return undefined;
  return (d.coherence + d.musicality + d.memorability + d.clarity + d.naturalness) / 5;
}

export function gateOf(s: SongScores | undefined): "pass" | "fail" | "unscored" {
  if (s?.wer === undefined) return "unscored";
  return s.wer <= YUE2_RECIPE.gateWer ? "pass" : "fail";
}

export const pct = (v: number | undefined): string => (v === undefined ? "—" : `${(v * 100).toFixed(v >= 1 ? 0 : 1)}%`);
export const num = (v: number | undefined, d = 2): string => (v === undefined ? "—" : v.toFixed(d));

const METRIC_WORDS: Readonly<Record<string, string>> = { wer: "wer", werSd: "diction", songEval: "SongEval", ce: "CE", buzzIdx: "buzz" };
const metricValue = (metric: string, v: number): string => (metric === "wer" || metric === "werSd" ? `${Math.round(v * 100)}%` : String(v));

/** One rule as the draw head's chip says it. */
export function ruleWords(r: LabRule): string {
  if (r.kind === "exclude") return `${METRIC_WORDS[r.metric] ?? r.metric} ${r.op === "gt" ? "≤" : "≥"} ${metricValue(r.metric, r.value)}`;
  if (r.kind === "seed-by") return `${METRIC_WORDS[r.metric] ?? r.metric} seeds`;
  if (r.kind === "size") return `${r.size} drawn`;
  const c = r.condition;
  return `only ${[c.cot === undefined ? "" : `cot ${c.cot}`, c.cfg === undefined ? "" : `cfg ${c.cfg.toFixed(1)}`, c.adapter === undefined ? "" : (ADAPTER_SHORT[c.adapter]?.cond ?? c.adapter)].filter((x) => x !== "").join(" · ")}`;
}

/** HH:MM of an instant (the band's clock), in the server's zone. */
export function hhmm(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
