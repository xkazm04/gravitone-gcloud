import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { MasterResult } from "@gt/domain/audio.master";
import type { MasterRecipe } from "@gt/domain/release";

import { createTake, listTakes } from "../sound/takes.ts";
import type { SoundTake } from "../sound/types.ts";

// THE MASTER TRIAL'S PARTS (spark audio-distribution, S1) - pipeline/master-trial.mts drives them: the
// trial record, the matched-loudness listening page, and the --adopt step that files a master as a child
// take of the take it was made from. The CLI owns the loop; these own the shapes, so a test reaches them
// without spawning tsx.

/** What the trial's own `measure` re-read of the written master said (acceptance is THIS, not the verb's self-report). */
export interface Remeasure {
  readonly integratedLufs: number | null;
  readonly truePeakDb: number | null;
  readonly lra: number | null;
  readonly clippedSamples: number;
}

export interface TrialRow {
  readonly title: string;
  readonly input: string;
  /** The master, or null when the verb failed (then `error` is its sentence). */
  readonly output: string | null;
  readonly master: MasterResult | null;
  readonly remeasure: Remeasure | null;
  /** after.lufs - before.lufs: what the master did to the level, + is up. */
  readonly gainDb: number | null;
  readonly pass: boolean;
  /** Why the row did not pass (the verb's or the meter's sentence), else null. */
  readonly error: string | null;
  readonly adopt: { readonly parentId: string | null; readonly takeId: string | null; readonly error: string | null } | null;
}

export interface Trial {
  readonly recipe: MasterRecipe;
  readonly at: string;
  readonly target: { readonly lufs: number; readonly truePeakDb: number; readonly tolLu: number };
  readonly rows: readonly TrialRow[];
  readonly totalMs: number;
}

export const LUFS_TOL = 0.5;

/** The acceptance judgement of one re-measured master: -14 +/- 0.5 LUFS, <= -1 dBTP, no clipped sample. */
export function judge(m: Remeasure, target: { readonly lufs: number; readonly truePeakDb: number }): string | null {
  if (m.integratedLufs === null) return "the master measured no integrated loudness";
  if (Math.abs(m.integratedLufs - target.lufs) > LUFS_TOL) return `integrated ${m.integratedLufs} LUFS is outside ${target.lufs} +/- ${LUFS_TOL}`;
  if (m.truePeakDb === null || m.truePeakDb > target.truePeakDb) return `true peak ${String(m.truePeakDb)} dBTP is above ${target.truePeakDb}`;
  if (m.clippedSamples > 0) return `${m.clippedSamples} clipped samples`;
  return null;
}

/** `<stem>.<recipe>.wav` - the recipe id is in every master's name. */
export function masterName(input: string, recipe: MasterRecipe): string {
  return `${path.basename(input, path.extname(input))}.${recipe}.wav`;
}

const norm = (s: string): string => s.normalize("NFC").trim().toLowerCase();

/**
 * The take a source file is the audio of: a take whose stored file IS it (the store names files by
 * take id), else one whose upload name or title equals the file's stem. Fixtures and file-less takes
 * never match. Two candidates are refused by name rather than guessed between.
 */
export function matchTake(takes: readonly SoundTake[], input: string): { readonly take: SoundTake } | { readonly error: string } {
  const stem = norm(path.basename(input, path.extname(input)));
  const withFile = takes.filter((t) => t.file !== null && t.origin !== "fixture");
  const byId = withFile.filter((t) => norm(t.id) === stem);
  const hits =
    byId.length > 0
      ? byId
      : withFile.filter((t) => (t.fileName !== null && norm(path.basename(t.fileName, path.extname(t.fileName))) === stem) || norm(t.title) === stem);
  const one = hits[0];
  if (hits.length === 1 && one !== undefined) return { take: one };
  if (hits.length === 0) return { error: `no take with a file named or titled "${path.basename(input, path.extname(input))}"` };
  return { error: `${hits.length} takes match "${path.basename(input, path.extname(input))}": ${hits.map((t) => t.id).join(", ")}` };
}

/**
 * File `master` as a child take of the matched take: same kind, provider, terms and group, `stage:
 * "remaster"` (a stage only a kept take may hold, so it is filed kept). A Suno parent's child is a
 * `suno-return` with a parent and no judgement of its own - lib/sound/ledger.ts isVersionOnly - so it
 * writes no ledger row; any other parent's child is an `import` and does.
 */
export async function adoptMaster(input: string, master: MasterResult): Promise<NonNullable<TrialRow["adopt"]>> {
  const found = matchTake(await listTakes(), input);
  if ("error" in found) return { parentId: null, takeId: null, error: found.error };
  const parent = found.take;
  try {
    const bytes = new Uint8Array(await readFile(master.output));
    const name = path.basename(master.output);
    const { take } = await createTake(
      {
        title: `${parent.title} (${master.recipe})`.slice(0, 200),
        kind: parent.kind,
        provider: parent.provider,
        op: "manual",
        origin: parent.origin === "suno-return" ? "suno-return" : "import",
        terms: parent.terms,
        prompt: parent.prompt,
        tempoBpm: parent.tempoBpm,
        key: parent.key,
        durationS: parent.durationS,
        parentId: parent.id,
        group: parent.group,
        verdict: "kept",
        stage: "remaster",
        note: `master ${master.recipe}: ${master.before.lufs} -> ${master.after.lufs} LUFS, ${master.after.truePeakDb} dBTP`,
        fileName: name,
      },
      { bytes, mime: "audio/wav", name },
    );
    return { parentId: parent.id, takeId: take.id, error: null };
  } catch (e) {
    return { parentId: parent.id, takeId: null, error: e instanceof Error ? e.message : String(e) };
  }
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const n = (v: number | null | undefined, places = 1): string => (v === null || v === undefined ? "-" : v.toFixed(places));
const signed = (v: number | null): string => (v === null ? "-" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}`);

/** A file's URL for a page opened from `pageDir`: a sibling by relative name, anything else by file:// URL. */
function href(file: string, pageDir: string): string {
  const rel = path.relative(pageDir, file);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) return rel.split(path.sep).map(encodeURIComponent).join("/");
  return pathToFileURL(file).href;
}

/**
 * The listening page: one row per track, before/after numbers, and an A/B player at MATCHED loudness -
 * the louder side is turned down by the LUFS difference (10^(-|after-before|/20)), so a switch compares
 * tone, not level (louder always reads as better). Volume on the media element, not a WebAudio gain:
 * a page opened from disk is an opaque origin, and Chrome feeds a MediaElementSource zeroes for a
 * file:// source ("outputs zeroes due to CORS access restrictions") - the original would play silent.
 * No network: one inline style, one inline script.
 */
export function listenPage(trial: Trial, pageDir: string): string {
  const rows = trial.rows
    .map((r, i) => {
      const b = r.master?.before ?? null;
      const a = r.master?.after ?? null;
      const diff = b && a ? a.lufs - b.lufs : 0;
      // Matched loudness: the louder side carries the attenuation (a media element's volume tops out at 1).
      const volA = diff < 0 ? 10 ** (diff / 20) : 1;
      const volB = diff > 0 ? 10 ** (-diff / 20) : 1;
      const player =
        r.output === null
          ? `<td class="err" colspan="2">${esc(r.error ?? "failed")}</td>`
          : `<td class="ab"><audio id="a${i}" preload="metadata" src="${esc(href(r.input, pageDir))}" data-vol="${volA.toFixed(4)}"></audio>` +
            `<audio id="b${i}" preload="metadata" src="${esc(href(r.output, pageDir))}" data-vol="${volB.toFixed(4)}"></audio>` +
            `<button data-row="${i}" data-side="a" aria-label="Play original, ${esc(r.title)}">A</button>` +
            `<button data-row="${i}" data-side="b" aria-label="Play ${esc(trial.recipe)} master, ${esc(r.title)}">B</button>` +
            `<button data-row="${i}" data-side="stop" aria-label="Stop ${esc(r.title)}">&#9632;</button>` +
            `<input type="range" min="0" max="1000" value="0" data-seek="${i}" aria-label="Position, ${esc(r.title)}"></td>` +
            `<td class="${r.pass ? "ok" : "err"}">${r.pass ? "pass" : esc(r.error ?? "miss")}</td>`;
      return (
        `<tr><th scope="row">${esc(r.title)}</th>` +
        `<td>${n(b?.lufs)} / ${n(b?.truePeakDb)} / ${n(b?.lra)}</td>` +
        `<td>${n(r.remeasure?.integratedLufs ?? a?.lufs)} / ${n(r.remeasure?.truePeakDb ?? a?.truePeakDb)} / ${n(r.remeasure?.lra ?? a?.lra)}</td>` +
        `<td class="num">${signed(r.gainDb)}</td>${player}</tr>`
      );
    })
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Master trial ${esc(trial.recipe)}</title>
<style>
:root{color-scheme:dark;--bg:#111317;--panel:#1a1d23;--ink:#e8eaed;--dim:#a3a9b3;--line:#2c313a;--ok:#6fd08c;--err:#ff8a7a;--on:#7cb7ff}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,sans-serif}
h1{font-size:18px;margin:0 0 4px}p{color:var(--dim);margin:0 0 16px;font-size:13px}
.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:900px;background:var(--panel)}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;font-size:13px;vertical-align:middle}
thead th{color:var(--dim);font-weight:600;font-size:12px}td.num{font-variant-numeric:tabular-nums}
td{font-variant-numeric:tabular-nums}.ok{color:var(--ok)}.err{color:var(--err)}
button{background:#262b33;color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:4px 10px;font:600 13px system-ui;cursor:pointer;margin-right:4px}
button.on{background:var(--on);color:#0b0d10;border-color:var(--on)}input[type=range]{width:180px;vertical-align:middle}
</style></head><body>
<h1>${esc(trial.recipe)} &middot; ${trial.rows.length} tracks &middot; target ${trial.target.lufs} LUFS, ${trial.target.truePeakDb} dBTP</h1>
<p>${esc(trial.at)} &middot; A original, B master, at matched loudness</p>
<div class="wrap"><table>
<thead><tr><th>Track</th><th>Before LUFS / dBTP / LRA</th><th>After LUFS / dBTP / LRA</th><th>Gain dB</th><th>A / B</th><th>Gate</th></tr></thead>
<tbody>
${rows}
</tbody></table></div>
<script>
(function(){
  var cur=null;
  function el(id){return document.getElementById(id);}
  function mark(row,side){document.querySelectorAll('button[data-side]').forEach(function(b){b.classList.toggle('on',b.dataset.row===row&&b.dataset.side===side);});}
  function stopAll(){document.querySelectorAll('audio').forEach(function(a){a.pause();});}
  document.querySelectorAll('audio').forEach(function(a){a.volume=Number(a.dataset.vol);});
  document.addEventListener('click',function(e){
    var b=e.target.closest('button[data-side]');if(!b)return;
    var row=b.dataset.row,side=b.dataset.side;
    if(side==='stop'){stopAll();cur=null;mark(null,null);return;}
    var next=el(side+row),other=el((side==='a'?'b':'a')+row);
    var t=cur&&cur.row===row?cur.el.currentTime:(other&&other.currentTime)||0;
    stopAll();
    try{next.currentTime=Math.min(t,(next.duration||t));}catch(_){}
    next.play();cur={row:row,el:next};mark(row,side);
  });
  setInterval(function(){
    if(!cur||!cur.el.duration)return;
    var s=document.querySelector('input[data-seek="'+cur.row+'"]');if(s)s.value=String(Math.round(cur.el.currentTime/cur.el.duration*1000));
  },250);
  document.addEventListener('input',function(e){
    var s=e.target.closest('input[data-seek]');if(!s)return;
    var row=s.dataset.seek;['a','b'].forEach(function(k){var a=el(k+row);if(a&&a.duration)a.currentTime=Number(s.value)/1000*a.duration;});
  });
})();
</script>
</body></html>
`;
}
