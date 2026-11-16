import path from "node:path";
import { pathToFileURL } from "node:url";

import type { MasterRecipe } from "@gt/domain/release";

import type { TrialRow } from "./masterTrial.ts";

// THE MASTER COMPARISON PAGE (spark audio-distribution): one row per song, the original and every recipe's
// master side by side, for the owner's ear. pipeline/master-trial.mts writes it as listen.html beside the
// masters; it opens from disk and loads nothing from the network.
//
// Two listening modes, switched at the top: MATCHED (default) turns every version down to the quietest
// one's integrated loudness, so a switch compares tone and image, not level - louder always reads as
// better; AS DELIVERED plays each file at its own level, which is how a listener meets it before a
// platform normalises it. Volume is set on the media element, not a WebAudio gain: a page opened from
// disk is an opaque origin and Chrome feeds a MediaElementSource zeroes for a file:// source.

export interface Measure3 {
  readonly lufs: number;
  readonly truePeakDb: number;
  readonly lra: number;
}

export interface CompareTrack {
  readonly title: string;
  readonly input: string;
  /** The source's own measurement (from the first recipe that mastered it), or null when every recipe failed. */
  readonly before: Measure3 | null;
  readonly versions: readonly { readonly recipe: MasterRecipe; readonly row: TrialRow }[];
}

export interface Compare {
  readonly at: string;
  readonly target: { readonly lufs: number; readonly truePeakDb: number; readonly tolLu: number };
  readonly recipes: readonly MasterRecipe[];
  readonly tracks: readonly CompareTrack[];
  readonly totalMs: number;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const n = (v: number | null | undefined, places = 1): string => (v === null || v === undefined ? "-" : v.toFixed(places));

/** A file's URL for a page opened from `pageDir`: a sibling by relative name, anything else by file:// URL. */
export function href(file: string, pageDir: string): string {
  const rel = path.relative(pageDir, file);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) return rel.split(path.sep).map(encodeURIComponent).join("/");
  return pathToFileURL(file).href;
}

interface Source {
  readonly label: string;
  readonly file: string | null;
  readonly m: Measure3 | null;
  readonly note: string | null;
  readonly pass: boolean;
}

function sourcesOf(t: CompareTrack): Source[] {
  const after = (r: TrialRow): Measure3 | null =>
    r.remeasure?.integratedLufs != null && r.remeasure.truePeakDb != null && r.remeasure.lra != null
      ? { lufs: r.remeasure.integratedLufs, truePeakDb: r.remeasure.truePeakDb, lra: r.remeasure.lra }
      : (r.master?.after ?? null);
  return [
    { label: "original", file: t.input, m: t.before, note: null, pass: true },
    ...t.versions.map((v) => ({ label: v.recipe, file: v.row.output, m: after(v.row), note: v.row.error, pass: v.row.pass })),
  ];
}

/** The volume that brings `lufs` down to `floor` (the row's quietest version); 1 when unmeasured. */
export const matchedVolume = (lufs: number | null, floor: number | null): number => (lufs === null || floor === null ? 1 : Math.min(1, 10 ** ((floor - lufs) / 20)));

function row(t: CompareTrack, i: number, pageDir: string): string {
  const srcs = sourcesOf(t);
  const lufs = srcs.map((s) => s.m?.lufs ?? null).filter((v): v is number => v !== null);
  const floor = lufs.length > 0 ? Math.min(...lufs) : null;
  const cells = srcs
    .map((s, k) => {
      const numbers = `<span class="m">${n(s.m?.lufs)} LUFS &middot; ${n(s.m?.truePeakDb)} dBTP &middot; LRA ${n(s.m?.lra)}</span>`;
      if (s.file === null) return `<td class="err">${esc(s.label)}<br>${esc(s.note ?? "failed")}</td>`;
      return (
        `<td><audio id="s${i}-${k}" preload="none" src="${esc(href(s.file, pageDir))}" data-matched="${matchedVolume(s.m?.lufs ?? null, floor).toFixed(4)}"></audio>` +
        `<button data-row="${i}" data-k="${k}" aria-label="Play ${esc(s.label)}, ${esc(t.title)}">${k + 1} &middot; ${esc(s.label)}</button>` +
        `${numbers}${s.pass ? "" : `<span class="err">${esc(s.note ?? "missed")}</span>`}</td>`
      );
    })
    .join("");
  return (
    `<tr data-row="${i}"><th scope="row">${esc(t.title)}<input type="range" min="0" max="1000" value="0" data-seek="${i}" aria-label="Position, ${esc(t.title)}"></th>${cells}</tr>`
  );
}

export function comparePage(c: Compare, pageDir: string): string {
  const head = ["original", ...c.recipes].map((r) => `<th>${esc(r)}</th>`).join("");
  const body = c.tracks.map((t, i) => row(t, i, pageDir)).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Master comparison ${esc(c.recipes.join(" / "))}</title>
<style>
:root{color-scheme:dark;--bg:#111317;--panel:#1a1d23;--ink:#e8eaed;--dim:#a3a9b3;--line:#2c313a;--ok:#6fd08c;--err:#ff8a7a;--on:#7cb7ff}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,sans-serif}
h1{font-size:18px;margin:0 0 4px}.bar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;color:var(--dim);font-size:13px;margin:0 0 16px}
.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:1000px;background:var(--panel)}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;font-size:13px;vertical-align:top}
thead th{color:var(--dim);font-weight:600;font-size:12px}th[scope=row]{width:220px}th[scope=row] input{display:block;width:200px;margin-top:6px}
td{font-variant-numeric:tabular-nums}.m{display:block;color:var(--dim);font-size:12px;margin-top:4px}.err{color:var(--err)}
button{background:#262b33;color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:5px 10px;font:600 13px system-ui;cursor:pointer}
button.on{background:var(--on);color:#0b0d10;border-color:var(--on)}tr.cur{outline:1px solid var(--on)}
kbd{border:1px solid var(--line);border-radius:3px;padding:0 4px;font:12px ui-monospace,monospace;color:var(--ink)}
</style></head><body>
<h1>${esc(c.recipes.join(" · "))} &middot; ${c.tracks.length} tracks &middot; target ${c.target.lufs} LUFS, ${c.target.truePeakDb} dBTP</h1>
<div class="bar"><span>${esc(c.at)}</span>
<label><input type="radio" name="mode" value="matched" checked> matched loudness</label>
<label><input type="radio" name="mode" value="delivered"> as delivered</label>
<span><kbd>1</kbd>-<kbd>${c.recipes.length + 1}</kbd> switch &middot; <kbd>&uarr;</kbd><kbd>&darr;</kbd> song &middot; <kbd>space</kbd> stop</span></div>
<div class="wrap"><table>
<thead><tr><th>Song</th>${head}</tr></thead>
<tbody>
${body}
</tbody></table></div>
<script>
(function(){
  var cur=null,mode='matched',rows=document.querySelectorAll('tbody tr').length,focus=0;
  function el(r,k){return document.getElementById('s'+r+'-'+k);}
  function vol(a){return mode==='matched'?Number(a.dataset.matched):1;}
  function mark(){document.querySelectorAll('button[data-k]').forEach(function(b){b.classList.toggle('on',!!cur&&b.dataset.row===cur.r&&b.dataset.k===cur.k);});
    document.querySelectorAll('tbody tr').forEach(function(t){t.classList.toggle('cur',t.dataset.row===String(focus));});}
  function stop(){document.querySelectorAll('audio').forEach(function(a){a.pause();});cur=null;mark();}
  function play(r,k){var next=el(r,k);if(!next)return;var t=cur&&cur.r===r?cur.a.currentTime:0;
    document.querySelectorAll('audio').forEach(function(a){a.pause();});next.volume=vol(next);
    var go=function(){try{next.currentTime=Math.min(t,next.duration||t);}catch(_){}next.play();};
    if(next.readyState>=1)go();else{next.preload='auto';next.addEventListener('loadedmetadata',go,{once:true});next.load();}
    cur={r:r,k:k,a:next};focus=Number(r);mark();}
  document.addEventListener('click',function(e){var b=e.target.closest('button[data-k]');if(b)play(b.dataset.row,b.dataset.k);});
  document.addEventListener('change',function(e){if(e.target.name!=='mode')return;mode=e.target.value;if(cur)cur.a.volume=vol(cur.a);});
  document.addEventListener('keydown',function(e){
    if(e.key===' '){e.preventDefault();stop();return;}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();focus=Math.max(0,Math.min(rows-1,focus+(e.key==='ArrowDown'?1:-1)));if(cur)stop();else mark();return;}
    var k=Number(e.key)-1;if(k>=0&&k<=${c.recipes.length})play(String(focus),String(k));
  });
  setInterval(function(){if(!cur||!cur.a.duration)return;var s=document.querySelector('input[data-seek="'+cur.r+'"]');if(s)s.value=String(Math.round(cur.a.currentTime/cur.a.duration*1000));},250);
  document.addEventListener('input',function(e){var s=e.target.closest('input[data-seek]');if(!s||!cur||cur.r!==s.dataset.seek||!cur.a.duration)return;cur.a.currentTime=Number(s.value)/1000*cur.a.duration;});
  mark();
})();
</script>
</body></html>
`;
}
