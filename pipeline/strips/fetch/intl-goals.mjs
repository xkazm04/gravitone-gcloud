// intl-goals: most international goals in men's football, all time. Cumulative goals per
// player at each year end, built goal-by-goal from Wikipedia's per-player goal lists.
//
// Entity selection is read from Wikipedia, not chosen by hand:
//   1. every player at or above the 20th-highest career total in "List of men's
//      footballers with 50 or more international goals" (ties at the cut included);
//   2. every holder of the all-time record named in that article's History section
//      (each holder is confirmed by a verbatim phrase found in the fetched wikitext).
// For each entity the goals cell of the 50+ table links either a "List of international
// goals scored by X" page or a section of the player's article; that page is fetched and
// its dated goal table parsed. No page or no parseable dated table -> excluded, with the
// reason in notes. Nothing is interpolated.
import { wikitext, writeFixture, parseWikitables, cellText, wikiDate, topAt, RETRIEVED } from "./_lib.mjs";

const START = 1950;
const END = Number(RETRIEVED.slice(0, 4)) - 1;
const LIST = "List of men's footballers with 50 or more international goals";
const TOP_N = 20;

const list = await wikitext(LIST, "goals/wiki-50-goals.json");
const W = list.text;

// ---- the 50+ table ------------------------------------------------------------------
const a = W.indexOf("== By player ==");
const b = W.indexOf("== By nationality ==");
const rows = [];
for (const r of W.slice(a, b).split(/\n\|-[^\n]*\n/)) {
  const nm = r.match(/\{\{sort name\|([^|}]*)\|([^|}]*)/);
  if (!nm) continue;
  const name = `${nm[1]} ${nm[2]}`.trim();
  const nation = (r.match(/\{\{fb\|([^|}]+)/) ?? [])[1] ?? null;
  // goals cell: first line that starts a data cell and contains "||"
  const gl = r.split("\n").find((l) => /^\|/.test(l) && l.includes("||") && /\d/.test(l) && !/sort name/.test(l));
  const link = gl?.match(/\[\[([^\]|]+)\|'*(\d{2,3})'*\]\]/);
  const plain = gl?.match(/^\|\s*(?:[a-z-]+="[^"]*"\s*)*\|?\s*'*(\d{2,3})/i);
  const goals = Number(link?.[2] ?? plain?.[1]);
  const span = (gl?.match(/(\d{4})\s*[–-]\s*(\d{4})?\s*\|\|/) ?? []);
  rows.push({ name, nation, goals, page: link?.[1] ?? null, careerFrom: span[1] ? +span[1] : null, careerTo: span[2] ? +span[2] : null });
}
rows.sort((x, y) => y.goals - x.goals);
const cut = rows[TOP_N - 1].goals;
const top = rows.filter((r) => r.goals >= cut);

// ---- record holders, from the History section --------------------------------------
const hist = W.slice(W.indexOf("== History =="), a);
const HOLDERS = [
  { name: "Imre Schlosser", phrase: "He remained the highest international goalscorer for 26 years" },
  { name: "Ferenc Puskás", phrase: "[[Ferenc Puskás]] broke the record in 1953" },
  { name: "Mokhtar Dahari", phrase: "until [[Mokhtar Dahari]] of [[Malaysia national football team|Malaysia]] broke the record" },
  { name: "Ali Daei", phrase: "In 2004, [[Ali Daei]] of [[Iran national football team|Iran]] broke the record" },
  { name: "Cristiano Ronaldo", phrase: "holds the all-time record" },
];
const contested = [{ name: "Vivian Woodward", phrase: "which would make him the first footballer to score 50 or more international goals" }];
for (const h of [...HOLDERS, ...contested]) {
  if (!W.includes(h.phrase)) throw new Error(`record-holder phrase not found in ${LIST}: ${h.phrase}`);
  if (!hist.includes(h.name.split(" ").at(-1))) throw new Error(`${h.name} not named in the History section`);
}
const wanted = new Map(top.map((r) => [r.name, { ...r, why: [`top ${TOP_N} (>= ${cut} goals)`] }]));
for (const h of HOLDERS) {
  const r = rows.find((x) => x.name === h.name);
  if (!r) throw new Error(`holder ${h.name} not in the 50+ table`);
  if (wanted.has(h.name)) wanted.get(h.name).why.push("record holder");
  else wanted.set(h.name, { ...r, why: ["record holder"] });
}

// ---- per-goal tables ---------------------------------------------------------------
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function goalsFromTables(text) {
  // Prefer goal-numbered tables (one row per goal). Per-match tables with a "Goals" count
  // are used only when no numbered table exists, because most pages also carry a
  // hat-trick table in that shape whose goals are already in the numbered table.
  const all = parseWikitables(text).filter((t) => !/youth|under-d|u-?dd|olympic|hat-?trick/i.test(cellText(t.caption)));
  // a numbered table with a "Goals" column is a hat-trick table (one row per match), not a goal list
  const numbered = all.filter((t) => { const h = headerOf(t); return h && h.iDate >= 0 && h.iNo >= 0 && h.iGoals < 0; });
  const perMatch = all.filter((t) => { const h = headerOf(t); return h && h.iDate >= 0 && h.iNo < 0 && h.iGoals >= 0; });
  return countGoals(numbered.length ? numbered : perMatch);
}
function headerOf(t) {
  const hdrIdx = t.rows.findIndex((r) => r.some((c) => c?.header && /date/i.test(cellText(c.text))));
  if (hdrIdx < 0) return null;
  const hdr = t.rows[hdrIdx].map((c) => cellText(c?.text ?? "").toLowerCase());
  return { hdrIdx, iDate: hdr.findIndex((h) => /^date/.test(h)), iNo: hdr.findIndex((h) => /^(no.?|#|goal no.?|goal)$/.test(h)), iGoals: hdr.findIndex((h) => /^goals$|^goal min/.test(h)) };
}
function countGoals(tables) {
  const goals = []; // dates (null if unparsed)
  let used = 0;
  for (const t of tables) {
    const hdrIdx = t.rows.findIndex((r) => r.some((c) => c?.header && /date/i.test(cellText(c.text))));
    if (hdrIdx < 0) continue;
    const hdr = t.rows[hdrIdx].map((c) => cellText(c?.text ?? "").toLowerCase());
    const iDate = hdr.findIndex((h) => /^date/.test(h));
    const iNo = hdr.findIndex((h) => /^(no\.?|#|goal no\.?|goal)$/.test(h));
    const iGoals = hdr.findIndex((h) => /^goals?$/.test(h));
    // a goal table needs a date column and either a goal-number or a goals column; a
    // per-match table with "Goals" counts per row is accepted, a by-year table is not
    if (iDate < 0 || (iNo < 0 && iGoals < 0)) continue;
    let n = 0;
    for (const r of t.rows.slice(hdrIdx + 1)) {
      if (!r[iDate]) continue;
      const d = wikiDate(r[iDate].text);
      if (iNo >= 0) {
        const c = r[iNo];
        if (!c || c.spanned) continue;
        const nums = cellText(c.text).match(/\d+/g);
        if (!nums) continue;
        const k = nums.length >= 2 && /[–-]/.test(c.text) ? Number(nums[1]) - Number(nums[0]) + 1 : nums.length;
        for (let j = 0; j < k; j++) goals.push(d);
        n += k;
      } else {
        const k = Number((cellText(r[iGoals]?.text).match(/\d+/) ?? [])[0]);
        if (!k) continue;
        for (let j = 0; j < k; j++) goals.push(d);
        n += k;
      }
    }
    if (n) used++;
  }
  return { goals, tables: used };
}

const built = [], excluded = [];
for (const [name, r] of wanted) {
  const id = slug(name);
  const c = contested.find((x) => x.name === name);
  if (c) {
    // the list's own footnote explains the total; quoted from the fetched wikitext
    const at = W.indexOf(`name="Woodward's_case"|`);
    const fn = at >= 0 ? W.slice(at + 23, W.indexOf("}}", W.indexOf("1914", at)) ) : null;
    excluded.push({ name, reason: `contested total (${r.goals}): the 50+ list counts England amateur matches for him and its History section names him only conditionally; footnote: "${cellText(fn ?? "")}"` });
    continue;
  }
  if (!r.page) { excluded.push({ name, reason: "the 50+ table links no goal list for him" }); continue; }
  const [title, section] = r.page.split("#");
  let page;
  try { page = await wikitext(title, `goals/pages/${slug(title)}.json`); }
  catch (e) { excluded.push({ name, reason: `page fetch failed: ${e.message}` }); continue; }
  let text = page.text;
  if (section) {
    // limit to the linked section (to the next heading of the same or higher level)
    const h = text.search(new RegExp(`^(=+)\\s*${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\1\\s*$`, "m"));
    if (h >= 0) {
      const lvl = text.slice(h).match(/^=+/)[0].length;
      const bodyAt = text.indexOf("\n", h) + 1; // search after the heading line itself
      const nx = text.slice(bodyAt).search(new RegExp(`^={1,${lvl}}[^=]`, "m"));
      text = text.slice(h, nx >= 0 ? bodyAt + nx : undefined);
    }
  }
  const { goals, tables } = goalsFromTables(text);
  const dated = goals.filter(Boolean).sort();
  const undated = goals.length - dated.length;
  const rec = { id, name, nation: r.nation, why: r.why, page: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}${section ? "#" + section : ""}`, revid: page.revid, tables, parsed: goals.length, undated, listTotal: r.goals, careerFrom: r.careerFrom, careerTo: r.careerTo, dates: dated };
  if (!goals.length) { excluded.push({ name, reason: `no dated goal table found on ${title}${section ? "#" + section : ""}` }); continue; }
  if (undated) { excluded.push({ name, reason: `${undated} of ${goals.length} goals on ${title} have no parseable date` }); continue; }
  built.push(rec);
}

// ---- series ---------------------------------------------------------------------------
const byId = Object.fromEntries(built.map((r) => [r.id, r]));
const valueAt = (id, y) => byId[id].dates.filter((d) => d <= `${y}-12-31`).length;
const ids = built.map((r) => r.id);
const series = {};
for (const id of ids) {
  const first = Math.max(START, +byId[id].dates[0].slice(0, 4));
  series[id] = [];
  for (let y = first; y <= END; y++) series[id].push([y, valueAt(id, y)]);
}

// ---- events: record changes and milestones, goal by goal --------------------------------
const log = built.flatMap((r) => r.dates.map((d) => [d, r.id])).sort((x, y) => x[0].localeCompare(y[0]));
const run = new Map();
let holder = null;
const events = [];
const ms = new Set();
for (const [d, id] of log) {
  const v = (run.get(id) ?? 0) + 1;
  run.set(id, v);
  if (!holder || (id !== holder && v > run.get(holder))) {
    if (holder && d >= `${START}`) events.push({ date: d, text: `${byId[id].name} passes ${byId[holder].name} for the all-time record: ${v} goals`, entity: id });
    holder = id;
  }
  for (const m of [50, 75, 100, 125]) if (v === m && !ms.has(m)) { ms.add(m); if (d >= `${START}`) events.push({ date: d, text: `${byId[id].name} becomes the first of these players to ${m} international goals`, entity: id }); }
}
const holderAtStart = (() => { const r = new Map(); let h = null; for (const [d, id] of log) { if (d >= `${START}`) break; const v = (r.get(id) ?? 0) + 1; r.set(id, v); if (!h || v > r.get(h)) h = id; } return h ? { id: h, v: r.get(h) } : null; })();
if (holderAtStart) events.unshift({ date: `${START}-01-01`, text: `${byId[holderAtStart.id].name} holds the record entering ${START}: ${holderAtStart.v} goals`, entity: holderAtStart.id });
const seen = new Set();
const evs = events.filter((e) => { const k = e.date + e.entity; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12);

// ---- cross-check ------------------------------------------------------------------------
const xcheck = built.map((r) => ({ name: r.name, built: r.dates.length, list: r.listTotal, diff: r.dates.length - r.listTotal, builtToEnd: valueAt(r.id, END) }));
const mism = xcheck.filter((x) => x.diff !== 0);

const out = {
  case: "intl-goals",
  title: "Most international goals in men's football, all time",
  hook: "Who has scored the most goals for his country?",
  unit: "goals",
  kind: "cumulative-race",
  source: {
    name: "Wikipedia per-player international goal lists, selected from the 50+ goals list (MediaWiki API)",
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(LIST.replace(/ /g, "_"))}`,
    revid: list.revid,
    retrieved: RETRIEVED,
    terms: "Wikipedia text is CC BY-SA 4.0; this derived data must credit Wikipedia contributors and carry the same licence.",
    notes: [
      `Entities: the ${top.length} players at or above the ${TOP_N}th-highest total (${cut} goals) in the 50+ list, plus the record holders named in its History section (${HOLDERS.map((h) => h.name).join(", ")}). ${contested[0].name} is named there only conditionally ("would make him the first..."; his total counts England amateur matches) and is not treated as a holder.`,
      `Each series is counted goal by goal from the player's dated goal table at its revid (see perEntity). Goals before ${START} are carried into the ${START} value; the series stops at ${END}-12-31, so players still active show fewer goals than their current totals.`,
      excluded.length ? `Excluded (no per-goal data, not interpolated): ${excluded.map((e) => `${e.name}: ${e.reason}`).join("; ")}.` : "No entity excluded.",
      mism.length ? `Mismatches against the 50+ list's current totals (built from goal table minus list): ${mism.map((x) => `${x.name} ${x.built} vs ${x.list} (${x.diff > 0 ? "+" : ""}${x.diff})`).join("; ")}. Left as the goal tables give them.` : "Every built career total matches the 50+ list.",
    ].join(" "),
    perEntity: built.map(({ dates: _dates, ...r }) => r),
    excluded,
    crossCheck: xcheck,
  },
  span: { start: START, end: END, step: "year" },
  entities: built.map((r) => ({ id: r.id, name: r.name, group: r.nation })).sort((x, y) => valueAt(y.id, END) - valueAt(x.id, END)),
  series,
  events: evs,
  topAtEnd: topAt(valueAt, ids, END, 10).map(([id, v]) => ({ id, name: byId[id].name, value: v })),
};
const f = writeFixture("intl-goals", out);
console.log(`wrote ${f}: ${START}-${END}, ${built.length} entities, ${excluded.length} excluded`);
console.table(xcheck);
console.log("EXCLUDED", excluded);
console.table(out.topAtEnd);
for (const e of evs) console.log(e.date, e.text);
