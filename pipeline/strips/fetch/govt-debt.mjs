// govt-debt: general government gross debt in current US dollars, by country, 1980-2024.
// debt_usd_bn = GGXWDG_NGDP (% of GDP) / 100 * NGDPD (GDP, current USD bn), both from
// the IMF DataMapper API (World Economic Outlook). Countries only: keys present in the
// DataMapper `countries` list (the regions/groups lists hold the aggregates).
import { cachedJSON, writeFixture, everTopN, topAt, levelEvents, round, RETRIEVED } from "./_lib.mjs";

const START = 1980, END = 2024;
const API = "https://www.imf.org/external/datamapper/api/v1";
const opt = { ua: null, minGapMs: 500 };
const pct = (await cachedJSON(`${API}/GGXWDG_NGDP`, "imf/GGXWDG_NGDP.json", opt)).values.GGXWDG_NGDP;
const gdp = (await cachedJSON(`${API}/NGDPD`, "imf/NGDPD.json", opt)).values.NGDPD;
const countries = (await cachedJSON(`${API}/countries`, "imf/countries.json", opt)).countries;
const regions = (await cachedJSON(`${API}/regions`, "imf/regions.json", opt)).regions;
const groups = (await cachedJSON(`${API}/groups`, "imf/groups.json", opt)).groups;
const indicators = (await cachedJSON(`${API}/indicators`, "imf/indicators.json", opt)).indicators;

const aggregates = new Set([...Object.keys(regions), ...Object.keys(groups)]);
const ids = Object.keys(pct).filter((k) => countries[k] && !aggregates.has(k));
const excluded = Object.keys(pct).filter((k) => !ids.includes(k));

const debt = (id, y) => {
  const p = pct[id]?.[y], g = gdp[id]?.[y];
  return p != null && g != null ? (p / 100) * g : null;
};
const keep = [...everTopN(debt, ids, START, END, 10)];
const series = {}, series_pct = {}, firstYear = {};
for (const id of keep) {
  series[id] = []; series_pct[id] = [];
  for (let y = START; y <= END; y++) {
    const v = debt(id, y);
    if (v == null) continue;
    firstYear[id] ??= y;
    series[id].push([y, round(v, 1)]);
    series_pct[id].push([y, pct[id][y]]);
  }
}
// gaps inside an entity's run (a year missing after its first year)
const holes = keep.flatMap((id) => {
  const ys = series[id].map(([y]) => y);
  const miss = [];
  for (let y = ys[0]; y <= END; y++) if (!ys.includes(y)) miss.push(y);
  return miss.length ? [`${countries[id].label}: ${miss.join(",")}`] : [];
});
const topEnd = topAt(debt, ids, END, 10);
const fullFrom = Math.max(...topEnd.map(([id]) => Math.min(...Object.keys(pct[id]).filter((y) => debt(id, y) != null).map(Number))));
const late = keep.filter((id) => firstYear[id] > START).sort((a, b) => firstYear[a] - firstYear[b]).map((id) => `${countries[id].label} ${firstYear[id]}`);

const name = (id) => countries[id].label;
const fmt = (v) => (v >= 1000 ? `$${round(v / 1000, 1)}tn` : `$${Math.round(v)}bn`);
// events only from the year the eventual leaders are all present, so an entity's late
// arrival in the data is never narrated as a "pass"
const events = levelEvents(debt, ids, name, fullFrom, END, { milestones: [5000, 10000, 15000, 20000, 25000, 30000], fmt, positions: 4 });

const out = {
  case: "govt-debt",
  title: "Largest government debts, in US dollars",
  hook: "Which country's government owes the most money?",
  unit: "US$ bn (current)",
  kind: "level-race",
  recommendedStart: fullFrom,
  source: {
    name: `IMF DataMapper API — ${indicators.GGXWDG_NGDP.label} (${indicators.GGXWDG_NGDP.unit}) x ${indicators.NGDPD.label} (${indicators.NGDPD.unit}); ${indicators.NGDPD.source}`,
    url: `${API}/GGXWDG_NGDP + ${API}/NGDPD`,
    retrieved: RETRIEVED,
    terms: "IMF data, free to use with attribution under the IMF Copyright and Usage terms (https://www.imf.org/en/About/copyright-and-terms); cite 'IMF, World Economic Outlook'.",
    notes: [
      `debt_usd_bn = GGXWDG_NGDP/100 x NGDPD, computed per country-year; both series last modified ${indicators.GGXWDG_NGDP["last-modified"]} / ${indicators.NGDPD["last-modified"]}.`,
      `Cut at ${END}: the WEO carries ${END + 1}+ as estimates/projections. The DataMapper API does not expose each country's 'estimates start after' year, so some ${END} (and, for late-reporting countries, earlier) values may be IMF staff estimates.`,
      `Debt-ratio coverage starts late for several large economies, so the early years under-count: first year with data — ${late.join(", ")}. Every one of the ${END} top 10 has data from ${fullFrom}; a race that should read as complete must start at recommendedStart (${fullFrom}).`,
      holes.length ? `Gaps inside a run: ${holes.join("; ")}.` : "No gaps inside any entity's run.",
      `Countries only: ${excluded.length} DataMapper keys dropped as regions/groups (${excluded.join(", ")}). Entities are the economies in the IMF 'countries' list, named as the IMF labels them.`,
    ].join(" "),
  },
  span: { start: START, end: END, step: "year" },
  entities: keep.map((id) => ({ id, name: name(id), group: id, firstYear: firstYear[id] })).sort((a, b) => (debt(b.id, END) ?? 0) - (debt(a.id, END) ?? 0)),
  series,
  series_pct,
  events,
  topAtEnd: topEnd.map(([id, v]) => ({ id, name: name(id), value: round(v, 1), pct_gdp: pct[id][END] })),
};
const f = writeFixture("govt-debt", out);
console.log(`wrote ${f}: ${START}-${END}, ${keep.length} entities, recommendedStart ${fullFrom}`);
console.table(out.topAtEnd);
console.log(out.source.notes);
for (const e of events) console.log(e.date, e.text);
