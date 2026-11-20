// THE DATA CARD - what the operator judges at a reel's first stop, drawn the moment `data` has measured the
// table: is this table worth a page? The Board shows one picture per stop (lib/decision/v1/sources/reel.ts), and
// a table is not a picture, so its measured shape is drawn as one: the title, the five counts the continuity
// gate takes (lib/reel/continuity.ts), each leader with the period it took the lead, and where the numbers came
// from and under what licence. Every figure on the card is one `data` measured or the table's own source line;
// nothing here is estimated or rounded.
//
// Drawn on the CPU launch (pipeline/reel/gpu.mts): the card is flat type, and the strips harness measured that
// launch byte-identical from run to run - which matters here, because a verdict is OF THE CARD'S BYTES
// (lib/reel/store.ts): a card that redraws to the same bytes is the same card, and no new round opens.

import { rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Continuity, ReelIdea, ReelTable } from "../../lib/reel/types";
import { launchReelBrowser } from "./gpu.mts";

export const CARD_FILE = "data-card.png";
const WIDTH = 1200;
const HEIGHT = 675;
/** Leaders drawn in two columns; past this the card says how many more there are. */
const LEADERS_MAX = 12;

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function cardHtml(idea: ReelIdea, table: Pick<ReelTable, "unit" | "granularity" | "periods" | "source">, c: Continuity, accepted?: string): string {
  const counts: readonly (readonly [number, string])[] = [
    [c.steps, `${table.granularity} steps`],
    [c.onScreen, "on screen"],
    [c.leadChanges, "lead changes"],
    [c.movements, "overtakes"],
    [c.events, "dated events"],
  ];
  const leaders = c.leaders.slice(0, LEADERS_MAX);
  const more = c.leaders.length - leaders.length;
  const span = `${table.periods[0] ?? ""} to ${table.periods[table.periods.length - 1] ?? ""}`;
  const under = c.ok ? "" : `<p class="under">${esc(c.failures.join(" · "))}${accepted === undefined ? "" : `<br><b>Taken on:</b> ${esc(accepted)}`}</p>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${WIDTH}px;height:${HEIGHT}px;background:#0f1115;color:#f2f3f5;font-family:"Segoe UI",system-ui,Arial,sans-serif;overflow:hidden}
body{padding:40px 48px;display:flex;flex-direction:column;gap:22px}
h1{font-size:40px;line-height:1.15;font-weight:650;letter-spacing:-.01em}
.hook{font-size:22px;color:#b8c0cc;margin-top:6px}
.counts{display:flex;gap:14px}
.count{flex:1;background:#191d24;border:1px solid #2c333e;border-radius:10px;padding:14px 16px}
.count b{display:block;font-size:44px;line-height:1;font-weight:650;font-variant-numeric:tabular-nums}
.count span{display:block;font-size:17px;color:#b8c0cc;margin-top:8px}
.leaders{flex:1;min-height:0;columns:2;column-gap:40px;font-size:19px;line-height:1.5}
.leaders div{display:flex;justify-content:space-between;gap:16px;break-inside:avoid}
.leaders i{font-style:normal;color:#b8c0cc;font-variant-numeric:tabular-nums;white-space:nowrap}
.under{font-size:17px;line-height:1.35;color:#ffc46b}
.source{font-size:17px;line-height:1.35;color:#b8c0cc;border-top:1px solid #2c333e;padding-top:14px}
.source b{color:#f2f3f5;font-weight:600}
</style></head><body>
<header><h1>${esc(idea.title)}</h1><p class="hook">${esc(idea.hook)}</p></header>
<section class="counts">${counts.map(([n, label]) => `<div class="count"><b>${n}</b><span>${esc(label)}</span></div>`).join("")}</section>
<section class="leaders">${leaders.map((l) => `<div><span>${esc(l.entity)}</span><i>${esc(l.from)}</i></div>`).join("")}${more > 0 ? `<div><span>and ${more} more leaders</span><i></i></div>` : ""}</section>
${under}
<footer class="source"><b>Source: ${esc(table.source.name)}</b> · ${esc(table.source.licence)}<br>${c.entities} entities · ${esc(table.unit)} · ${esc(span)} · fetched ${esc(table.source.fetchedAt)}</footer>
</body></html>`;
}

/** Draw `<dir>/data-card.png`, landed by rename. Returns the file. */
export async function drawDataCard(dir: string, idea: ReelIdea, table: ReelTable, c: Continuity, accepted?: string): Promise<string> {
  const file = path.join(dir, CARD_FILE);
  const tmp = path.join(dir, "data-card.partial.png");
  const { browser } = await launchReelBrowser("cpu");
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    // The card is this CLI's own html and holds no url; anything that still asks for the network is refused.
    await page.route("**/*", (route) => route.abort());
    await page.setContent(cardHtml(idea, table, c, accepted), { waitUntil: "load" });
    await writeFile(tmp, await page.screenshot({ type: "png" }));
    await rename(tmp, file);
    return file;
  } finally {
    await rm(tmp, { force: true }).catch(() => {});
    await browser.close().catch(() => {});
  }
}
