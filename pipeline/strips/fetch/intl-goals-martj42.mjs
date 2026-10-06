// intl-goals: cumulative men's international football goals per player, year ends.
// Source: martj42/international_results goalscorers.csv (CC0), own goals excluded.
// Cross-check: Wikipedia "List of men's footballers with 50 or more international goals".
import { cachedText, writeFixture, wikitext, everTopN, topAt, RETRIEVED } from "./_lib.mjs";

const URL = "https://raw.githubusercontent.com/martj42/international_results/master/goalscorers.csv";
const START = 1950;

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const csv = parseCSV(await cachedText(URL, `goals/goalscorers-${RETRIEVED}.csv`));
const maxDate = csv.reduce((m, r) => (r.date > m ? r.date : m), "");
// last COMPLETE calendar year in the file: the year before the newest goal's year,
// unless the newest goal falls on 31 Dec (never assumed)
const END = Number(maxDate.slice(0, 4)) - 1;

const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// a player is (scorer, team): the dataset has no player ids, and the same name can
// belong to different players on different teams
const people = {};
const perYear = new Map(); // id -> Map(year -> goals that year)
const allTime = new Map(); // id -> goals in the whole file (incl. current partial year)
const goalLog = []; // [date, id] in date order for event derivation
let skippedOwn = 0, skippedBlank = 0;
for (const r of csv) {
  if (r.own_goal === "TRUE") { skippedOwn++; continue; }
  if (!r.scorer || r.scorer === "NA") { skippedBlank++; continue; }
  const id = `${slug(r.scorer)}--${slug(r.team)}`;
  people[id] ??= { id, name: r.scorer, group: r.team };
  allTime.set(id, (allTime.get(id) ?? 0) + 1);
  const y = Number(r.date.slice(0, 4));
  if (y > END) continue;
  if (!perYear.has(id)) perYear.set(id, new Map());
  perYear.get(id).set(y, (perYear.get(id).get(y) ?? 0) + 1);
  goalLog.push([r.date, id]);
}
goalLog.sort((a, b) => a[0].localeCompare(b[0]));

// cumulative at end of year (goals before START are carried into the opening value)
const cumCache = new Map();
const valueAt = (id, y) => {
  const k = id + y;
  if (cumCache.has(k)) return cumCache.get(k);
  let s = 0;
  for (const [yy, n] of perYear.get(id) ?? []) if (yy <= y) s += n;
  cumCache.set(k, s);
  return s;
};
const ids = [...perYear.keys()];
const keep = [...everTopN(valueAt, ids, START, END, 10)];
const series = {};
for (const id of keep) {
  const first = Math.max(START, Math.min(...perYear.get(id).keys()));
  series[id] = [];
  for (let y = first; y <= END; y++) series[id].push([y, valueAt(id, y)]);
}

// ---- events, goal-by-goal from the same data ---------------------------------
const nm = (id) => people[id].name;
const running = new Map();
const events = [];
let leader = null;
const milestones = [50, 75, 100, 125];
const hitMs = new Set();
for (const [date, id] of goalLog) {
  const v = (running.get(id) ?? 0) + 1;
  running.set(id, v);
  if (date < `${START}-01-01`) { if (!leader || v > running.get(leader)) leader = id; continue; }
  if (leader !== id && v > (running.get(leader) ?? 0)) {
    events.push({ date, text: `${nm(id)} (${people[id].group}) passes ${nm(leader)} for the most international goals in the dataset: ${v}`, entity: id });
    leader = id;
  }
  for (const m of milestones) if (v === m && !hitMs.has(m)) { hitMs.add(m); events.push({ date, text: `${nm(id)} becomes the first player in the dataset to ${m} international goals`, entity: id }); }
}
const seen = new Set();
let evs = events.filter((e) => { const k = e.date + e.entity; if (seen.has(k)) return false; seen.add(k); return true; });
// keep the post-1950 lead changes and milestones; if more than 12, keep the latest 12
evs = evs.sort((a, b) => a.date.localeCompare(b.date)).slice(-12);

// ---- coverage: how many of the results table's goals have scorer rows ---------
const RESULTS_URL = "https://raw.githubusercontent.com/martj42/international_results/master/results.csv";
const results = parseCSV(await cachedText(RESULTS_URL, `goals/results-${RETRIEVED}.csv`));
const scorerRows = new Map();
for (const r of csv) { const k = `${r.date}|${r.home_team}|${r.away_team}`; scorerRows.set(k, (scorerRows.get(k) ?? 0) + 1); }
const cov = { friendly: [0, 0], competitive: [0, 0] }; // [goals in results, goals with scorer rows]
const covDecade = {};
for (const r of results) {
  const g = Number(r.home_score) + Number(r.away_score);
  if (!Number.isFinite(g) || r.date.slice(0, 4) > String(END)) continue;
  const kind = r.tournament === "Friendly" ? "friendly" : "competitive";
  const have = scorerRows.get(`${r.date}|${r.home_team}|${r.away_team}`) ?? 0;
  cov[kind][0] += g; cov[kind][1] += have;
  if (kind === "competitive" && r.date >= `${START}`) {
    const d = r.date.slice(0, 3) + "0s";
    covDecade[d] ??= [0, 0]; covDecade[d][0] += g; covDecade[d][1] += have;
  }
}
const pct = ([a, b]) => (a ? Math.round((b / a) * 100) : 0);
const coverage = {
  friendlyGoalsWithScorer: `${cov.friendly[1]}/${cov.friendly[0]} (${pct(cov.friendly)}%)`,
  competitiveGoalsWithScorer: `${cov.competitive[1]}/${cov.competitive[0]} (${pct(cov.competitive)}%)`,
  competitiveByDecade: Object.fromEntries(Object.entries(covDecade).map(([d, v]) => [d, `${pct(v)}%`])),
};

// ---- cross-check --------------------------------------------------------------
const wiki = await wikitext("List of men's footballers with 50 or more international goals", "goals/wiki-50-goals.json");
const wikiRows = [];
for (const row of wiki.text.split(/\n\|-\s*\n/)) {
  const n = row.match(/\{\{sort name\|([^|}]*)\|([^|}]*)/);
  const g = row.match(/\n\|\s*(?:\[\[[^|\]]*\|)?'*(\d{2,3})(?:\]\])?[^\n]*\|\|/);
  if (n && g) wikiRows.push({ name: `${n[1]} ${n[2]}`.trim(), goals: Number(g[1]) });
}
const norm = (s) => slug(s).replace(/-/g, "");
const top3 = topAt(valueAt, ids, END, 3);
const xcheck = top3.map(([id, v]) => {
  const w = wikiRows.find((r) => norm(r.name) === norm(people[id].name));
  const toDate = allTime.get(id);
  return { id, name: people[id].name, datasetEndOfSpan: v, datasetToDate: toDate, wikipediaToDate: w?.goals ?? null, diff: w ? toDate - w.goals : null };
});
const wikiTop3 = wikiRows.slice(0, 3);

const out = {
  case: "intl-goals-martj42",
  title: "Most men's international goals in competitive matches (recorded scorers)",
  hook: "Who has scored the most goals for his country?",
  unit: "goals",
  kind: "cumulative-race",
  source: {
    name: "martj42/international_results — goalscorers.csv",
    url: URL,
    retrieved: RETRIEVED,
    terms: "Dataset licensed CC0 1.0 (public domain dedication) per the GitHub repository. Wikipedia cross-check text is CC BY-SA 4.0.",
    notes: [
      `Men's full internationals only (the dataset excludes Olympic, B-team, U-23 and league-select matches). Own goals excluded (${skippedOwn} rows); ${skippedBlank} rows with no scorer name skipped.`,
      `Goal-level coverage is INCOMPLETE, especially in early decades: goals are only counted for matches present in the dataset's results table that also have scorer rows, so many players' totals are lower than official tallies.`,
      `Friendlies carry NO scorer rows at all (${coverage.friendlyGoalsWithScorer} friendly goals have a scorer), so this is effectively competitive-match goals only; even there ${coverage.competitiveGoalsWithScorer} of goals have a scorer (by decade from ${START}: ${Object.entries(coverage.competitiveByDecade).map(([d, v]) => `${d} ${v}`).join(", ")}).`,
      `A player is identified by (scorer name, team) since the file has no player ids. Goals before ${START} are carried into the ${START} opening value. Newest goal in the file: ${maxDate}; ${END} is the last complete year, later goals are excluded from the series.`,
      `Cross-check vs Wikipedia (revid ${wiki.revid}), comparing whole-file totals (incl. ${END + 1} to date) to Wikipedia's to-date figures: ${xcheck.map((x) => `${x.name} dataset ${x.datasetToDate} vs Wikipedia ${x.wikipediaToDate ?? "not found"}${x.diff ? ` (diff ${x.diff > 0 ? "+" : ""}${x.diff})` : ""}`).join("; ")}. Wikipedia's top 3: ${wikiTop3.map((r) => `${r.name} ${r.goals}`).join(", ")}. Discrepancies are left as the dataset records them.`,
    ].join(" "),
    crossCheck: { name: "Wikipedia: List of men's footballers with 50 or more international goals", url: "https://en.wikipedia.org/wiki/List_of_men%27s_footballers_with_50_or_more_international_goals", revid: wiki.revid, rows: xcheck, wikipediaTop3: wikiTop3 },
  },
  caveat: `NOT an official all-time ranking: the order differs from official career totals (${wikiTop3.map((r, i) => { const rk = topAt(valueAt, ids, END, 500).findIndex(([id]) => norm(people[id].name) === norm(r.name)); return `Wikipedia #${i + 1} ${r.name} is #${rk + 1} here`; }).join("; ")}). Present it as 'competitive goals in the open martj42 dataset' or do not use it for a 'who has the most' hook.`,
  coverage,
  span: { start: START, end: END, step: "year" },
  entities: keep.map((id) => people[id]).sort((a, b) => valueAt(b.id, END) - valueAt(a.id, END)),
  series,
  events: evs,
  topAtEnd: topAt(valueAt, ids, END, 10).map(([id, v]) => ({ id, name: people[id].name, group: people[id].group, value: v })),
};
const f = writeFixture("intl-goals-martj42", out);
console.log(`wrote ${f}: ${START}-${END}, ${keep.length} entities, newest goal ${maxDate}`);
console.table(out.topAtEnd);
console.table(xcheck);
console.log("wiki top3", wikiTop3);
for (const e of evs) console.log(e.date, e.text);
