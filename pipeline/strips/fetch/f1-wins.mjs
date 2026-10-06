// f1-wins: cumulative Formula One World Championship race wins per driver, year ends.
// Source: Jolpica-F1 (Ergast-compatible) API, one request per season (cached).
// Cross-check: Wikipedia "List of Formula One Grand Prix winners" (MediaWiki API).
import { cachedJSON, writeFixture, wikitext, everTopN, topAt, RETRIEVED } from "./_lib.mjs";

const START = 1950;
const API = "https://api.jolpi.ca/ergast/f1";

// Last COMPLETE season: the latest year whose scheduled race count equals its
// winners-reported race count and whose last race date is before the retrieval date.
async function season(year) {
  const sched = await cachedJSON(`${API}/${year}.json?limit=100`, `f1/schedule-${year}.json`, { minGapMs: 400 });
  const res = await cachedJSON(`${API}/${year}/results/1.json?limit=100`, `f1/winners-${year}.json`, { minGapMs: 400 });
  return { scheduled: Number(sched.MRData.total), races: res.MRData.RaceTable.Races };
}

const seasons = {};
let END = START;
for (let y = START; y <= 2030; y++) {
  const s = await season(y);
  const lastDate = s.races.at(-1)?.date ?? "9999";
  if (s.scheduled === 0 || s.races.length !== s.scheduled || lastDate >= RETRIEVED) break;
  seasons[y] = s.races;
  END = y;
}

// race-by-race running totals (shared drives credit a win to every listed winner,
// matching the official convention the API encodes)
const drivers = {};
const total = new Map();
const raceLog = []; // { date, race, winners[] }
const atYearEnd = new Map(); // id -> Map(year -> cum)
for (let y = START; y <= END; y++) {
  for (const r of seasons[y]) {
    const winners = r.Results.filter((x) => x.position === "1").map((x) => x.Driver);
    for (const d of winners) {
      drivers[d.driverId] = { id: d.driverId, name: `${d.givenName} ${d.familyName}`, group: d.nationality };
      total.set(d.driverId, (total.get(d.driverId) ?? 0) + 1);
    }
    raceLog.push({ date: r.date, race: `${r.season} ${r.raceName}`, winners: winners.map((d) => d.driverId), snapshot: new Map(total) });
  }
  for (const [id, v] of total) {
    if (!atYearEnd.has(id)) atYearEnd.set(id, new Map());
    atYearEnd.get(id).set(y, v);
  }
}

const ids = [...total.keys()];
const valueAt = (id, y) => {
  // carry forward: value at end of y is the last recorded at or before y
  const m = atYearEnd.get(id);
  for (let k = y; k >= START; k--) if (m.has(k)) return m.get(k);
  return 0;
};
const keep = [...everTopN(valueAt, ids, START, END, 10)];

const series = {};
for (const id of keep) {
  const first = Math.min(...atYearEnd.get(id).keys());
  series[id] = [];
  for (let y = first; y <= END; y++) series[id].push([y, valueAt(id, y)]);
}

// ---- events, derived race-by-race from the same data -----------------------
const events = [];
const nm = (id) => drivers[id].name;
let leader = null;
for (const e of raceLog) {
  const ranked = [...e.snapshot.entries()].sort((a, b) => b[1] - a[1]);
  const [topId, topV] = ranked[0];
  if (leader === null) {
    leader = topId;
    events.push({ date: e.date, text: `${nm(topId)} wins the first World Championship race (${e.race})`, entity: topId });
    continue;
  }
  const leaderV = e.snapshot.get(leader);
  if (topV > leaderV) {
    events.push({ date: e.date, text: `${nm(topId)} passes ${nm(leader)} for the all-time lead: ${topV} wins (${e.race})`, entity: topId });
    leader = topId;
  }
}
// first to reach round-number milestones
for (const m of [25, 50, 75, 100]) {
  const hit = raceLog.find((e) => [...e.snapshot.values()].some((v) => v >= m));
  if (!hit) continue;
  const who = [...hit.snapshot.entries()].find(([, v]) => v >= m)[0];
  events.push({ date: hit.date, text: `${nm(who)} becomes the first driver to ${m} wins (${hit.race})`, entity: who });
}
// dedupe by date+entity (a lead change that is also a milestone keeps the lead-change line), sort, cap 12
const seen = new Set();
const evs = events
  .filter((e) => { const k = e.date + e.entity; if (seen.has(k)) return false; seen.add(k); return true; })
  .sort((a, b) => a.date.localeCompare(b.date))
  .slice(0, 12);

// ---- cross-check against Wikipedia ------------------------------------------
const wiki = await wikitext("List of Formula One Grand Prix winners", "f1/wiki-gp-winners.json");
const top5 = topAt(valueAt, ids, END, 5);
// Wikipedia counts "to date", i.e. it includes the season in progress, so the API side
// of the comparison adds the current season's completed races (fetched separately and
// NOT used in the series, which stops at the last complete season).
const cur = await cachedJSON(`${API}/${END + 1}/results/1.json?limit=100`, `f1/winners-${END + 1}-partial-${RETRIEVED}.json`, { minGapMs: 400 });
const curWins = new Map();
for (const r of cur.MRData.RaceTable.Races)
  for (const x of r.Results) if (x.position === "1") curWins.set(x.Driver.driverId, (curWins.get(x.Driver.driverId) ?? 0) + 1);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const xcheck = top5.map(([id, v]) => {
  // the by-nationality table lists "[[Driver]] (N)"; take the first such mention
  const re = new RegExp(`\\[\\[(?:[^\\]|]*\\|)?${esc(drivers[id].name)}\\]\\]'*\\s*\\((\\d{1,3})\\)`);
  const m = wiki.text.match(re);
  const toDate = v + (curWins.get(id) ?? 0);
  return { id, name: drivers[id].name, apiEndOfSpan: v, apiToDate: toDate, wikipediaToDate: m ? Number(m[1]) : null, match: m ? Number(m[1]) === toDate : null };
});

const out = {
  case: "f1-wins",
  title: "Most Formula One race wins, all time",
  hook: "Who has won the most Formula One races?",
  unit: "wins",
  kind: "cumulative-race",
  source: {
    name: "Jolpica-F1 API (Ergast-compatible), season winners endpoint",
    url: `${API}/{year}/results/1.json?limit=100`,
    retrieved: RETRIEVED,
    terms: "Jolpica-F1 data is published for free public use (Ergast-compatible community API; see https://github.com/jolpica/jolpica-f1 for terms). Cross-check text from Wikipedia is CC BY-SA 4.0.",
    notes: `World Championship races only, ${START}-${END} (${END} is the last complete season at retrieval). Includes the Indianapolis 500 rounds of 1950-1960, which counted toward the World Championship. Shared drives (1950s) credit the win to each listed driver, as the API records them. Cross-check vs Wikipedia (revid ${wiki.revid}): ${xcheck.map((x) => `${x.name} API ${x.apiEndOfSpan} at end ${END}, ${x.apiToDate} incl. ${END + 1} races to date vs Wikipedia ${x.wikipediaToDate ?? "n/a"}${x.match === false ? " (MISMATCH)" : ""}`).join("; ")}.`,
    crossCheck: { name: "Wikipedia: List of Formula One Grand Prix winners", url: "https://en.wikipedia.org/wiki/List_of_Formula_One_Grand_Prix_winners", revid: wiki.revid, rows: xcheck },
  },
  span: { start: START, end: END, step: "year" },
  entities: keep.map((id) => drivers[id]).sort((a, b) => valueAt(b.id, END) - valueAt(a.id, END)),
  series,
  events: evs,
  topAtEnd: topAt(valueAt, ids, END, 10).map(([id, v]) => ({ id, name: drivers[id].name, value: v })),
};
const f = writeFixture("f1-wins", out);
console.log(`wrote ${f}: ${START}-${END}, ${keep.length} entities, ${raceLog.length} races`);
console.table(out.topAtEnd);
console.table(xcheck);
for (const e of evs) console.log(e.date, e.text);
