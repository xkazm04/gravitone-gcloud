// gdp-top: largest economies by nominal GDP (current US$), 1960-2024, World Bank WDI.
// Countries only: the World Bank country list marks aggregates with region.id "NA".
import { cachedJSON, writeFixture, everTopN, topAt, levelEvents, round, RETRIEVED } from "./_lib.mjs";

const START = 1960, END = 2024;
const IND = "NY.GDP.MKTP.CD";
const URL = `https://api.worldbank.org/v2/country/all/indicator/${IND}?format=json&per_page=20000&date=${START}:${END}`;
const [meta, rows] = await cachedJSON(URL, `wb/${IND}-${START}-${END}.json`);
const [cmeta, clist] = await cachedJSON("https://api.worldbank.org/v2/country?format=json&per_page=400", "wb/countries.json");
if (meta.pages !== 1 || cmeta.pages !== 1) throw new Error("World Bank response paginated; raise per_page");

const country = Object.fromEntries(clist.filter((c) => c.region.id !== "NA").map((c) => [c.id, c]));
const aggregates = clist.filter((c) => c.region.id === "NA").length;
const val = {}; // id -> {year: usd}
for (const r of rows) {
  if (!country[r.countryiso3code] || r.value == null) continue;
  (val[r.countryiso3code] ??= {})[r.date] = r.value;
}
const ids = Object.keys(val);
const bn = (id, y) => (val[id]?.[y] != null ? val[id][y] / 1e9 : null);

const keep = [...everTopN(bn, ids, START, END, 10)];
const series = {}, firstYear = {};
for (const id of keep) {
  series[id] = [];
  for (let y = START; y <= END; y++) {
    const v = bn(id, y);
    if (v == null) continue;
    firstYear[id] ??= y;
    series[id].push([y, round(v, 1)]);
  }
}
const holes = keep.flatMap((id) => {
  const ys = new Set(series[id].map(([y]) => y));
  const miss = [];
  for (let y = firstYear[id]; y <= END; y++) if (!ys.has(y)) miss.push(y);
  return miss.length ? [`${country[id].name}: ${miss.join(",")}`] : [];
});
// large economies with no early data at all: anyone in the top 10 at END or ever, starting late
const late = keep.filter((id) => firstYear[id] > START).sort((a, b) => firstYear[a] - firstYear[b]).map((id) => `${country[id].name} ${firstYear[id]}`);
const topEnd = topAt(bn, ids, END, 10);
const fullFrom = Math.max(...topEnd.map(([id]) => firstYear[id] ?? Math.min(...Object.keys(val[id]).map(Number))));
// predecessor states the WDI country list does not carry
const missingStates = ["SUN", "YUG", "CSK", "DDR"].filter((k) => !country[k]);

const name = (id) => country[id].name;
const fmt = (v) => (v >= 1000 ? `$${round(v / 1000, 1)}tn` : `$${Math.round(v)}bn`);
const events = levelEvents(bn, ids, name, START, END, { milestones: [1000, 5000, 10000, 20000, 25000], fmt, positions: 3 });

const out = {
  case: "gdp-top",
  title: "The world's largest economies",
  hook: "Which countries have the biggest economies?",
  unit: "US$ bn (current)",
  kind: "level-race",
  recommendedStart: fullFrom,
  source: {
    name: `World Bank, World Development Indicators — ${rows[0].indicator.value} (${IND})`,
    url: URL,
    retrieved: RETRIEVED,
    terms: "World Bank data, CC BY 4.0 (https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets); attribute 'World Bank, World Development Indicators'.",
    notes: [
      `WDI last updated ${meta.lastupdated}. Values converted to US$ bn (value/1e9). ${aggregates} aggregates dropped via region.id == "NA"; ${ids.length} economies kept (the list includes territories and SARs as the World Bank reports them).`,
      `Coverage starts late for some large economies, so early years under-count: first year with data — ${late.join(", ") || "none"}. The ${END} top 10 are all present from ${fullFrom} (recommendedStart).`,
      `Predecessor states are absent: ${missingStates.join(", ")} are not in the WDI country list (no USSR, Yugoslavia, Czechoslovakia or East Germany series), so the Soviet economy never appears before the Russian Federation series starts; Germany (DEU) has values from ${firstYear.DEU} as WDI publishes them, with no East/West split.`,
      holes.length ? `Gaps inside a run: ${holes.join("; ")}.` : "No gaps inside any entity's run.",
    ].join(" "),
  },
  span: { start: START, end: END, step: "year" },
  entities: keep.map((id) => ({ id, name: name(id), group: country[id].region.value, firstYear: firstYear[id] })).sort((a, b) => (bn(b.id, END) ?? 0) - (bn(a.id, END) ?? 0)),
  series,
  events,
  topAtEnd: topEnd.map(([id, v]) => ({ id, name: name(id), value: round(v, 1) })),
};
const f = writeFixture("gdp-top", out);
console.log(`wrote ${f}: ${START}-${END}, ${keep.length} entities, recommendedStart ${fullFrom}`);
console.table(out.topAtEnd);
console.log(out.source.notes);
for (const e of events) console.log(e.date, e.text);
