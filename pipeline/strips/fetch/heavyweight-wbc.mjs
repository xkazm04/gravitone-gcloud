// heavyweight-wbc: WBC world heavyweight champions as a sequence of reigns, 1963 onward.
// Source: Wikipedia "List of WBC world champions" -> Heavyweight table (MediaWiki API).
// Same table shape as The Ring list, so the parsing is the same as heavyweight-lineal.mjs.
import { wikitext, writeFixture, RETRIEVED } from "./_lib.mjs";

const START = 1963;
const END = Number(RETRIEVED.slice(0, 4)) - 1; // last complete year
const SPAN_END = `${END}-12-31`;

const page = await wikitext("List of WBC world champions", "boxing/wiki-wbc-champions.json");

// ---- slice the Heavyweight table ------------------------------------------------
const t = page.text;
const a = t.indexOf("==Heavyweight==");
const b = t.indexOf("{|", a);
const c = t.indexOf("\n|}", b);
const table = t.slice(b, c)
  .replace(/<ref[^>]*\/>/g, "")
  .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "");

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, "0");
// "23 Sep 1926" | "23 Sept 1952" | "May 1970" | "1922" | "15 Feb" (year borrowed)
function parseDate(s, fallbackYear) {
  s = s.replace(/\{\{[^}]*\}\}/g, "").replace(/'''?/g, "").trim();
  let m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/);
  if (m) return { date: `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(+m[1])}`, precision: "day" };
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\.?$/);
  if (m && fallbackYear) return { date: `${fallbackYear}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(+m[1])}`, precision: "day" };
  m = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (m) return { date: `${m[2]}-${pad(MONTHS[m[1].toLowerCase()])}-01`, precision: "month" };
  m = s.match(/^(\d{4})$/);
  if (m) return { date: `${m[1]}-01-01`, precision: "year" };
  throw new Error(`unparsed date: ${s}`);
}
const strip = (s) => s
  .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
  .replace(/\{\{small\|([^}]*)\}\}/g, "$1")
  .replace(/<br\s*\/?>/g, " ")
  .replace(/style="[^"]*"\|/g, "")
  .replace(/'''?/g, "")
  .replace(/\s+/g, " ")
  .trim();

const rows = table.split(/\n\|-[^\n]*\n/).slice(1);
const reignsAll = [];
const notes = []; // { afterNo, text }
for (const row of rows) {
  const lines = row.split("\n").map((l) => l.trim()).filter(Boolean);
  if (/^!\s*colspan/.test(lines[0])) {
    notes.push({ afterNo: reignsAll.length, text: strip(lines.join(" ").replace(/^!\s*colspan="?4"?\s*\|/, "")) });
    continue;
  }
  const no = lines[0].match(/^!\s*(\d+)/);
  if (!no) continue;
  const nameCell = lines[1].replace(/^\|\s*align=\w+\s*\|/i, "");
  const reignCell = strip(lines[2].replace(/^\|/, ""));
  const defenses = Number(strip(lines[3].replace(/^\|/, "")).match(/\d+/)[0]);
  const display = strip(nameCell.replace(/<br>[\s\S]*/, "").replace(/\{\{small[\s\S]*/, ""));
  const name = display.replace(/\s*\(\d\)\s*$/, "").trim();
  const paren = strip((nameCell.match(/\(\{\{small\|([^}]*)\}\}\)/) ?? [])[1] ?? "");
  const [fromS, toS] = reignCell.split(/\s*[–—-]\s*/);
  const toP = /present/i.test(toS) ? null : parseDate(toS);
  const fromP = parseDate(fromS, toP?.date.slice(0, 4));
  reignsAll.push({ no: Number(no[1]), name, display, paren, from: fromP, to: toP, defenses });
}

// ---- derive how_won, vacancies --------------------------------------------------
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const vacanciesAll = [];
for (let i = 0; i < reignsAll.length; i++) {
  const r = reignsAll[i], prev = reignsAll[i - 1];
  const note = notes.find((n) => n.afterNo === i);
  if (/awarded/i.test(r.paren)) { r.how_won = "awarded title"; if (r.paren.length > 14) r.how_won_detail = r.paren; }
  else if (/^def\./.test(r.paren)) r.how_won = `${r.paren} for the vacant title`;
  else if (r.paren) r.how_won = r.paren; // e.g. a contender or interim champion promoted
  else if (prev && prev.to && prev.to.date === r.from.date) r.how_won = `def. ${prev.name}`;
  else r.how_won = r.paren || "see source";
  if (prev && prev.to && prev.to.date < r.from.date) {
    vacanciesAll.push({ from: prev.to.date, to: r.from.date, fromPrecision: prev.to.precision, toPrecision: r.from.precision, reason: note?.text ?? "vacant" });
  }
}
// trailing vacancy (none expected while the last reign reads "present")
const _last = reignsAll.at(-1);

// ---- clip to span -----------------------------------------------------------------
const inSpan = (from, to) => (to ?? "9999") >= `${START}-01-01` && from <= SPAN_END;
const reigns = reignsAll.filter((r) => inSpan(r.from.date, r.to?.date)).map((r) => ({
  id: slug(r.name),
  name: r.name,
  reign_no: r.no,
  from: r.from.date,
  ...(r.from.precision !== "day" ? { fromPrecision: r.from.precision } : {}),
  to: r.to?.date ?? null,
  how_won: r.how_won,
  ...(r.how_won_detail ? { how_won_detail: r.how_won_detail } : {}),
  defenses: r.defenses,
}));
const vacancies = vacanciesAll.filter((v) => inSpan(v.from, v.to));

// cumulative days as champion at each year end (only days inside listed reigns, from 1922)
const DAY = 86400000;
const days = (a, b) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / DAY));
const ids = [...new Set(reigns.map((r) => r.id))];
const series = {};
for (const id of ids) {
  const mine = reignsAll.filter((r) => slug(r.name) === id);
  const first = Math.max(START, Math.min(...mine.map((r) => +r.from.date.slice(0, 4))));
  series[id] = [];
  for (let y = first; y <= END; y++) {
    const cut = `${y + 1}-01-01`;
    let d = 0;
    for (const r of mine) {
      const end = r.to ? (r.to.date < cut ? r.to.date : cut) : cut;
      if (r.from.date < cut) d += days(r.from.date, end);
    }
    series[id].push([y, d]);
  }
}
const entities = ids.map((id) => ({ id, name: reigns.find((r) => r.id === id).name }));

// ---- cross-check start dates against "List of world heavyweight boxing champions" ----
const other = await wikitext("List of world heavyweight boxing champions", "boxing/wiki-heavyweight-champions.json");
const MONTHNAME = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const longDate = (d) => `${MONTHNAME[+d.slice(5, 7) - 1]} ${+d.slice(8)}, ${d.slice(0, 4)}`;
const startCheck = reigns.filter((r) => !r.fromPrecision).map((r) => ({ reign_no: r.reign_no, name: r.name, ring: r.from, foundInOtherList: other.text.includes(longDate(r.from)) }));
const mismatches = startCheck.filter((x) => !x.foundInOtherList);

// ---- events derived from the reign list ------------------------------------------
const events = [];
for (const v of vacancies) if (v.from >= `${START}` && days(v.from, v.to) > 30) events.push({ date: v.from, text: `Title vacant: ${v.reason.split(/(?<=\.)\s/)[0]}`, entity: null });
const regains = reigns.filter((r, i) => reigns.slice(0, i).some((p) => p.id === r.id));
for (const r of regains) events.push({ date: r.from, text: `${r.name} regains the title (${r.how_won})`, entity: r.id });
const total = Object.entries(series).map(([id, s]) => [id, s.at(-1)[1]]).sort((x, y) => y[1] - x[1]);
const most = reigns.reduce((m, r) => (r.defenses > m.defenses ? r : m));
events.push({ date: most.from, text: `${most.name} begins the reign with the most defenses in this span (${most.defenses})`, entity: most.id });
// the champion holding the title at the end of the span (reigns after it are outside the span)
const atEnd = reigns.find((r) => r.from <= SPAN_END && (r.to === null || r.to > SPAN_END));
if (atEnd) events.push({ date: atEnd.from, text: `${atEnd.name} wins the title (${atEnd.how_won}) and holds it at the end of ${END}`, entity: atEnd.id });
const seen = new Set();
const evs = events
  .sort((x, y) => x.date.localeCompare(y.date))
  .filter((e) => { const k = e.date + e.entity; if (seen.has(k)) return false; seen.add(k); return true; })
  .filter((e, i, all) => i < 11 || i === all.length - 1); // keep the current-champion line

const out = {
  case: "heavyweight-wbc",
  title: "WBC heavyweight champions, 1963 onward",
  hook: "Who has held the WBC heavyweight title the longest?",
  unit: "days as champion",
  kind: "reigns",
  caveat: "One sanctioning body's title, not the lineal or undisputed championship: WBC reigns can begin by promotion of a contender or end by stripping, and other bodies' champions held rival belts at the same time.",
  source: {
    name: "Wikipedia: List of WBC world champions (Heavyweight table), via MediaWiki API",
    url: page.url,
    page: "https://en.wikipedia.org/wiki/List_of_WBC_world_champions#Heavyweight",
    revid: page.revid,
    retrieved: RETRIEVED,
    terms: "Wikipedia text is licensed CC BY-SA 4.0 (attribution + share-alike); reuse of this derived data must credit Wikipedia contributors and carry the same licence.",
    notes: `Reigns overlapping ${START}-${END}. Dates as the table gives them; month-only dates are set to the 1st with fromPrecision 'month'. A reign with no note in the table is taken to begin by beating the previous champion when the previous reign ended that same day. 'to: null' means current at revid ${page.revid}; series counts its days to ${SPAN_END}. Cross-check: ${startCheck.length - mismatches.length}/${startCheck.length} reign start dates also appear verbatim in 'List of world heavyweight boxing champions' (revid ${other.revid}); not found there: ${mismatches.map((x) => `#${x.reign_no} ${x.name} ${x.ring}`).join(", ") || "none"} (left as the WBC list gives them).`,
    crossCheck: { page: "https://en.wikipedia.org/wiki/List_of_world_heavyweight_boxing_champions", revid: other.revid, startDates: startCheck },
  },
  span: { start: START, end: END, step: "year" },
  entities,
  reigns,
  vacancies,
  series,
  events: evs,
  topAtEnd: total.slice(0, 10).map(([id, v]) => ({ id, name: entities.find((e) => e.id === id).name, value: v })),
};
const f = writeFixture("heavyweight-wbc", out);
console.log(`wrote ${f}: ${reigns.length} reigns, ${vacancies.length} vacancies, ${entities.length} boxers`);
for (const r of reigns) console.log(r.reign_no, r.from, "->", r.to, r.name, "|", r.how_won, "|", r.defenses);
console.log("VACANCIES");
for (const v of vacancies) console.log(v.from, "->", v.to, v.reason.slice(0, 90));
console.table(out.topAtEnd);
console.log('start-date mismatches', mismatches);
for (const e of evs) console.log(e.date, e.text.slice(0, 120));
