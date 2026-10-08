// Shared helpers for the strip fixture fetchers. Zero deps: global fetch + node:fs.
//
// Every raw download is cached under ./.cache/ keyed by a caller-chosen name, so a
// rerun is offline and byte-identical; delete the cache file to refetch. Fixtures
// are written to ../data/<case>.json.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CACHE = join(HERE, ".cache");
export const DATA = join(HERE, "..", "data");
export const RETRIEVED = "2026-10-06";
const UA = "gravitone-strips-fixtures/0.1 (data fixture builder; contact: repo owner)";

mkdirSync(CACHE, { recursive: true });
mkdirSync(DATA, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastNetwork = 0;

/** Fetch text with an on-disk cache. `minGapMs` spaces network calls (rate limits). */
// `ua: null` sends the runtime default User-Agent (the IMF edge rejects custom ones).
export async function cachedText(url, name, { minGapMs = 300, retries = 4, ua = UA } = {}) {
  const file = join(CACHE, name);
  if (existsSync(file)) return readFileSync(file, "utf8");
  for (let attempt = 0; ; attempt++) {
    const wait = lastNetwork + minGapMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastNetwork = Date.now();
    const res = await fetch(url, { headers: ua ? { "user-agent": ua, accept: "*/*" } : { accept: "*/*" } });
    if (res.ok) {
      const text = await res.text();
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
      return text;
    }
    if (attempt >= retries || ![429, 500, 502, 503, 504].includes(res.status)) {
      throw new Error(`${res.status} ${res.statusText} for ${url}`);
    }
    await sleep((Number(res.headers.get("retry-after")) || 2 * 2 ** attempt) * 1000);
  }
}

export async function cachedJSON(url, name, opts) {
  return JSON.parse(await cachedText(url, name, opts));
}

export function writeFixture(caseId, obj) {
  const file = join(DATA, `${caseId}.json`);
  writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
  return file;
}

/** Wikitext of a page via the MediaWiki parse API (cached). */
export async function wikitext(page, name, { minGapMs = 1200 } = {}) {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext|revid&format=json&formatversion=2&redirects=1`;
  const j = await cachedJSON(url, name, { minGapMs, retries: 6 });
  if (j.error) throw new Error(`wiki ${page}: ${j.error.info}`);
  return { text: j.parse.wikitext, revid: j.parse.revid, title: j.parse.title, url };
}

/**
 * Bar-race helpers. `cum` is Map<id, Map<year, value>> of values at end of year.
 * Returns the ids ever in the top N at any year end within [start, end].
 */
export function everTopN(valueAt, ids, start, end, n = 10) {
  const keep = new Set();
  for (let y = start; y <= end; y++) {
    const ranked = ids
      .map((id) => [id, valueAt(id, y)])
      .filter(([, v]) => v != null && v > 0)
      .sort((a, b) => b[1] - a[1]);
    if (!ranked.length) continue;
    // include ties at the cut so the 10th place is never arbitrary
    const cut = ranked[Math.min(n, ranked.length) - 1][1];
    for (const [id, v] of ranked) if (v >= cut) keep.add(id);
  }
  return keep;
}

export function topAt(valueAt, ids, year, n = 10) {
  return ids
    .map((id) => [id, valueAt(id, year)])
    .filter(([, v]) => v != null && v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

/** Leader per year (ties: the incumbent keeps the lead). */
export function leaders(valueAt, ids, start, end) {
  const out = [];
  let prev = null;
  for (let y = start; y <= end; y++) {
    const ranked = topAt(valueAt, ids, y, 3);
    if (!ranked.length) continue;
    let lead = ranked[0][0];
    if (prev && ranked.some(([id, v]) => id === prev && v === ranked[0][1])) lead = prev;
    out.push({ year: y, id: lead, value: valueAt(lead, y), prev });
    prev = lead;
  }
  return out;
}

export const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

/**
 * Events for a level race, derived from the data: changes of the #1 and #2 spots
 * between consecutive year ends, and the first year any entity crosses each milestone.
 * Dates are year-end ("YYYY-12-31") because the data is annual.
 */
export function levelEvents(valueAt, ids, nameOf, start, end, { milestones = [], fmt = (v) => String(v), unit = "", max = 12, positions = 2 } = {}) {
  const ev = [];
  let prevRank = null;
  for (let y = start; y <= end; y++) {
    const r = topAt(valueAt, ids, y, positions).map(([id]) => id);
    if (prevRank && r.length === positions && prevRank.length === positions) {
      if (r[0] !== prevRank[0]) ev.push({ date: `${y}-12-31`, text: `${nameOf(r[0])} passes ${nameOf(prevRank[0])} for #1 (${fmt(valueAt(r[0], y))}${unit})`, entity: r[0], weight: 9 });
      else for (let p = 1; p < positions; p++) {
        // a newcomer to place p+1 that was below it last year (not a swap caused above it)
        if (r[p] !== prevRank[p] && !prevRank.slice(0, p).includes(r[p])) {
          ev.push({ date: `${y}-12-31`, text: `${nameOf(r[p])} moves up to #${p + 1} (${fmt(valueAt(r[p], y))}${unit})`, entity: r[p], weight: 9 - p * 2 });
          break;
        }
      }
    }
    prevRank = r;
  }
  for (const m of milestones) {
    for (let y = start; y <= end; y++) {
      const hit = topAt(valueAt, ids, y, 1)[0];
      if (hit && hit[1] >= m) { ev.push({ date: `${y}-12-31`, text: `${nameOf(hit[0])} is the first to pass ${fmt(m)}${unit} (${fmt(hit[1])}${unit} in ${y})`, entity: hit[0], weight: 1 }); break; }
    }
  }
  const seen = new Set();
  const out = ev.sort((a, b) => a.date.localeCompare(b.date)).filter((e) => { const k = e.date + e.entity; if (seen.has(k)) return false; seen.add(k); return true; });
  // over the cap: drop the lowest-weight lines first, earliest first
  while (out.length > max) {
    const minW = Math.min(...out.map((e) => e.weight));
    out.splice(out.findIndex((e) => e.weight === minW), 1);
  }
  return out.map(({ weight: _weight, ...e }) => e);
}

// ---- wikitext tables ----------------------------------------------------------------
/** Strip refs, comments and efn notes from wikitext (keeps everything else). */
export function dropRefs(t) {
  return t
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/\{\{(?:efn|refn|sfn|Efn|Refn|Sfn|NoteTag|notetag|r)\|(?:[^{}]|\{\{[^{}]*\}\})*\}\}/g, "");
}

/** Split a row line into cells on || or !! that are not inside [[...]] or {{...}}. */
function splitCells(line, sep) {
  const out = [];
  let depthSq = 0, depthCu = 0, cur = "";
  for (let i = 0; i < line.length; i++) {
    const two = line.slice(i, i + 2);
    if (two === "[[") { depthSq++; cur += two; i++; continue; }
    if (two === "]]") { depthSq--; cur += two; i++; continue; }
    if (two === "{{") { depthCu++; cur += two; i++; continue; }
    if (two === "}}") { depthCu--; cur += two; i++; continue; }
    if (depthSq <= 0 && depthCu <= 0 && (two === sep || (sep === "!!" && two === "||"))) { out.push(cur); cur = ""; i++; continue; }
    cur += line[i];
  }
  out.push(cur);
  return out;
}

/** Separate a cell's attributes from its content ("style=x | content"). */
function cellParts(raw) {
  let depthSq = 0, depthCu = 0;
  for (let i = 0; i < raw.length; i++) {
    const two = raw.slice(i, i + 2);
    if (two === "[[") { depthSq++; i++; continue; }
    if (two === "]]") { depthSq--; i++; continue; }
    if (two === "{{") { depthCu++; i++; continue; }
    if (two === "}}") { depthCu--; i++; continue; }
    if (raw[i] === "|" && depthSq === 0 && depthCu === 0) {
      const attrs = raw.slice(0, i);
      if (/^\s*([a-z-]+\s*=\s*("[^"]*"|'[^']*'|[^\s|]+)\s*)+$/i.test(attrs)) return { attrs, content: raw.slice(i + 1).trim() };
      break;
    }
  }
  return { attrs: "", content: raw.trim() };
}

/**
 * Parse every {| ... |} table in wikitext into { caption, rows: [[{text, header}]] }, with
 * rowspan/colspan expanded so each row is a full grid row. Nested tables are skipped.
 */
export function parseWikitables(wikitext) {
  const tables = [];
  const lines = dropRefs(wikitext).split("\n");
  let cur = null, depth = 0;
  let row = null;
  const flushRow = () => { if (cur && row && row.length) cur.rawRows.push(row); row = null; };
  for (const line0 of lines) {
    const line = line0.trim();
    if (line.startsWith("{|")) {
      depth++;
      if (depth === 1) { cur = { caption: "", rawRows: [] }; row = null; }
      continue;
    }
    if (line.startsWith("|}")) {
      depth--;
      if (depth === 0 && cur) { flushRow(); tables.push(cur); cur = null; }
      continue;
    }
    if (!cur || depth !== 1) continue;
    if (line.startsWith("|+")) { cur.caption = line.slice(2).trim(); continue; }
    if (line.startsWith("|-")) { flushRow(); row = []; continue; }
    if (line.startsWith("!") || line.startsWith("|")) {
      row ??= [];
      const header = line.startsWith("!");
      for (const raw of splitCells(line.slice(1), header ? "!!" : "||")) {
        const { attrs, content } = cellParts(raw);
        const rs = Number((attrs.match(/rowspan\s*=\s*"?(\d+)/i) ?? [])[1] ?? 1);
        const cs = Number((attrs.match(/colspan\s*=\s*"?(\d+)/i) ?? [])[1] ?? 1);
        row.push({ text: content, header, rs, cs, attrs });
      }
      continue;
    }
    // continuation of the previous cell's content
    if (row && row.length) row[row.length - 1].text += "\n" + line;
  }
  // expand spans
  for (const t of tables) {
    const grid = [];
    const pending = []; // col -> { cell, left }
    for (const raw of t.rawRows) {
      const out = [];
      let col = 0, k = 0;
      const place = () => { while (pending[col] && pending[col].left > 0) { out[col] = { ...pending[col].cell, spanned: true }; pending[col].left--; col++; } };
      place();
      for (; k < raw.length; k++) {
        const c = raw[k];
        for (let j = 0; j < c.cs; j++) {
          out[col] = c;
          if (c.rs > 1) pending[col] = { cell: c, left: c.rs - 1 };
          col++;
          place();
        }
      }
      place();
      grid.push(out);
    }
    t.rows = grid;
    delete t.rawRows;
  }
  return tables;
}

/** Plain text of a wikitext cell: links -> label, templates mostly dropped. */
export function cellText(s = "") {
  return s
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/\{\{(?:sronly|abbr|abbrlink|tooltip)\|([^|{}]*)(?:\|[^{}]*)?\}\}/gi, "$1")
    .replace(/\{\{(?:nowrap|small|sort|sortname|nobr|center)\|([^{}]*)\}\}/gi, "$1")
    .replace(/'''?/g, "")
    .replace(/<br\s*\/?>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const MONTHS_EN = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const p2 = (n) => String(n).padStart(2, "0");
/** Parse a wikitext date cell to YYYY-MM-DD (day precision only), or null. */
export function wikiDate(s = "") {
  let m = s.match(/\{\{\s*(?:dts|dtsort|date table sorting|start date|Start date|sort date|Sort date|dates)\s*\|([^{}]*)\}\}/i);
  if (m) {
    const parts = m[1].split("|").map((x) => x.trim()).filter((x) => x && !/=/.test(x));
    if (parts.length >= 3 && /^\d{4}$/.test(parts[0])) {
      const mo = /^\d+$/.test(parts[1]) ? +parts[1] : MONTHS_EN[parts[1].slice(0, 3).toLowerCase()];
      if (mo && /^\d+$/.test(parts[2])) return `${parts[0]}-${p2(mo)}-${p2(+parts[2])}`;
    }
    if (parts.length >= 1) { const d = wikiDate(parts.join(" ")); if (d) return d; }
  }
  const t = cellText(s.replace(/\{\{[^{}]*\}\}/g, (x) => x.replace(/^\{\{[^|]*\|/, "").replace(/\}\}$/, "")));
  m = t.match(/(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})/);
  if (m && MONTHS_EN[m[2].slice(0, 3).toLowerCase()]) return `${m[3]}-${p2(MONTHS_EN[m[2].slice(0, 3).toLowerCase()])}-${p2(+m[1])}`;
  m = t.match(/([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS_EN[m[1].slice(0, 3).toLowerCase()]) return `${m[3]}-${p2(MONTHS_EN[m[1].slice(0, 3).toLowerCase()])}-${p2(+m[2])}`;
  m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
