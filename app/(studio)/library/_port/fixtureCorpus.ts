import "server-only";

// THE FIXTURE CORPUS - 5,000 Library items, generated deterministically from ./fixtureData.ts
// with the prototype's fixed share per kind (library-data.js: image .17, plate .37, style .025,
// motion .07, audio .225, video .03, doc .11). Each record carries what the index would hold for
// it: the stored item (through the schema door when the detail asks), its facet values, its
// search text, its lineage, its extras and its media facts.
//
// The prototype padded its 254 real items with "illustrative" ones; a stored record may not be
// illustrative (@gt/domain/libraryItem), so here every item is `fixture` - honest about being a
// fixture universe - except a tenth that are `derived` and name the item they came from.
// Four game-asset `model` items (./fixtureModels.ts) and six muse `character` items
// (./fixtureCharacters.ts) take the last documents' places, so the corpus stays 5,000 and every
// record drawn before them is the one it always was.
// A few items carry the media trouble the index measures at ingest (an export that does not
// decode, a plate whose file is gone), so the attention facet has something to find.

import type { z } from "zod";

import { CHIP_GROUPS, normText, techniqueBand, type Attention, type LibraryExtras, type LibraryRow, type LineageNode, type MediaFacts } from "@gt/domain/library";
import type { libraryItemSchema } from "@gt/domain/libraryItem";

import { fixtureCharacters } from "./fixtureCharacters.ts";
import { fixtureModels } from "./fixtureModels.ts";
import { BUNDLES, CLIPS, DECK, fileBlob, HUNTS, LESSONS, MECHANISMS, PALETTES, peaksOf, PROJECTS, rng, RUNS, SCENES, SOUND, STYLES, SUBJECTS, TOPICS, TRIAL_STYLES, type FixtureMedia } from "./fixtureData.ts";

type Raw = z.input<typeof libraryItemSchema>;

export type FixtureRecord = {
  readonly raw: Raw;
  readonly row: LibraryRow;
  /** Facet values by group - the vocabulary plus state, origin, source, attention and collections. */
  readonly f: Record<string, string[]>;
  readonly hay: string;
  /** Milliseconds, 0 when undated. */
  readonly t: number;
  readonly extras: LibraryExtras;
  readonly lineage: readonly LineageNode[];
  readonly media: MediaFacts | null;
  readonly peaks?: readonly number[];
  readonly palette?: readonly [string, string];
  readonly video?: string;
  readonly poster?: string;
};

export const TOTAL = 5000;
const SHARE: readonly [Raw["kind"], number][] = [["image", 0.17], ["plate", 0.37], ["style", 0.025], ["motion", 0.07], ["audio", 0.225], ["video", 0.03], ["doc", 0.11]];

const words = (v: string): string => v.replace(/[-_]/g, " ");
const cap = (v: string): string => v.replace(/^\w/, (c) => c.toUpperCase());
const styleOf = (id: string) => STYLES.find((s) => s.id === id);

/** A value's label: a style by its name, a project by its title, a hunt by its idea, else the words. */
export function labelOf(group: string, value: string): string {
  if (group === "style") return styleOf(value)?.name ?? words(value);
  if (group === "project") return PROJECTS.find((p) => p.id === value)?.title ?? value;
  if (group === "hunt") return HUNTS.find((h) => h.id === value)?.label ?? value;
  if (group === "run" || group === "set" || group === "state" || group === "source" || group === "origin") return value;
  if (group === "attention") return value === "missing" ? "media missing" : "media unreadable";
  return words(value);
}

const T0 = Date.parse("2025-11-03T00:00:00Z");
const T1 = Date.parse("2026-10-13T20:00:00Z");

export function buildCorpus(): readonly FixtureRecord[] {
  const r = rng();
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)] as T;
  const some = <T,>(a: readonly T[], lo: number, hi: number): T[] => {
    const n = lo + Math.floor(r() * (hi - lo + 1));
    const out = new Set<T>();
    for (let i = 0; i < n * 3 && out.size < n; i++) out.add(pick(a));
    return [...out];
  };
  const weighted = <T,>(pairs: readonly (readonly [T, number])[]): T => {
    let x = r() * pairs.reduce((s, p) => s + p[1], 0);
    for (const [v, w] of pairs) if ((x -= w) < 0) return v;
    return (pairs[0] as readonly [T, number])[0];
  };
  const date = (): string => new Date(T0 + Math.floor(r() * (T1 - T0))).toISOString();
  const proj = (p = 0.14): string[] => (r() < p ? [pick(PROJECTS).id] : []);
  const facts = (m: FixtureMedia, over: Partial<MediaFacts> = {}): MediaFacts => {
    const luma = 20 + Math.floor(r() * 140);
    return { sha: m.sha, decodable: true, mime: m.mime, w: m.w, h: m.h, durationS: null, posterSha: null, meanLuma: luma, nearBlack: false, probedAt: "2026-10-16T09:00:00.000Z", error: null, ...over };
  };

  const out: FixtureRecord[] = [];
  const counter: Record<string, number> = {};
  const nextId = (k: string): string => `${k}-${String((counter[k] = (counter[k] ?? 0) + 1)).padStart(4, "0")}`;

  type Draft = Omit<FixtureRecord, "row" | "hay" | "t"> & { readonly meta: string };
  const add = (d: Draft): void => {
    const raw = d.raw;
    const f = d.f;
    f["state"] = [raw.state];
    f["origin"] = [raw.origin];
    f["source"] = [raw.source];
    f["pin"] ??= [];
    const attention = f["attention"]?.[0] as Attention | undefined;
    const cover = raw.kind === "audio" || raw.kind === "doc" || raw.kind === "model" || raw.media === undefined || attention !== undefined ? null : raw.media;
    const posterSha = d.media?.posterSha ?? null;
    const coverSha = raw.kind === "video" || raw.kind === "motion" ? posterSha : (cover?.sha256 ?? null);
    const chips = CHIP_GROUPS[raw.kind].flatMap((g) => (f[g] ?? []).slice(0, 1).map((v) => ({ group: g, value: v, label: labelOf(g, v) }))).slice(0, 3);
    const row: LibraryRow = {
      id: raw.id,
      kind: raw.kind,
      title: raw.title,
      meta: d.meta,
      state: raw.state,
      origin: raw.origin,
      source: raw.source,
      date: raw.at ?? null,
      cover: { blobSha: coverSha, mime: coverSha === null ? null : "image/jpeg", nearBlack: d.media?.nearBlack ?? false },
      ...(attention === undefined ? {} : { attention }),
      chips,
      ...(raw.kind === "model" && d.poster !== undefined ? { poster: d.poster } : {}),
    };
    const vals = Object.entries(f).flatMap(([g, vs]) => vs.flatMap((v) => [v, labelOf(g, v)]));
    const hay = normText([raw.title, raw.id, d.meta, ...vals].join(" "));
    const { meta: _meta, ...rest } = d;
    void _meta;
    out.push({ ...rest, row, hay, t: raw.at === undefined ? 0 : Date.parse(raw.at) });
  };
  const base = (kind: Raw["kind"], title: string, state: Raw["state"], origin: Raw["origin"], f: Record<string, string[]>, at: string | undefined) => {
    const collections = (["project", "run", "hunt"] as const).flatMap((k) => (f[k] ?? []).map((id) => ({ kind: k, id })));
    return { id: nextId(kind), title, state, origin, source: "fixture" as const, rights: { use: kind === "image" ? ("reference-only" as const) : ("publishable" as const) }, collections, lineage: [], ...(at === undefined ? {} : { at }) };
  };
  const self = (id: string, kind: string): LineageNode => ({ role: "this", ref: { kind: "self", id }, label: kind });
  const runNode = (id: string): LineageNode => ({ role: "run", ref: { kind: "run", id }, label: id, facet: { group: "run", value: id } });
  const projNodes = (ps: readonly string[], role = "used by"): LineageNode[] => ps.map((p) => ({ role, ref: { kind: "project", id: p }, label: labelOf("project", p), facet: { group: "project", value: p } }));

  const quota = SHARE.map(([k, w]) => [k, Math.round(TOTAL * w)] as const);
  const models = fixtureModels();
  const characters = fixtureCharacters();
  const sum = quota.reduce((s, q) => s + q[1], 0);

  // ── styles first: every other kind points at them ──
  const styleItem = new Map<string, string>();
  for (const st of STYLES) {
    const f: Record<string, string[]> = { family: [st.family], derivation: [st.derivation], project: PROJECTS.filter((p) => p.style === st.id).map((p) => p.id), run: [pick(RUNS.forge)] };
    for (const [k, v] of Object.entries(st.obs)) f[k] = [v];
    const hero = st.hero ? fileBlob(`/presets/${st.id}.jpg`) : undefined;
    const b = base("style", st.name, st.hero ? "ratified" : "candidate", st.derivation === "extracted" ? "extract" : "forge", f, date());
    styleItem.set(st.id, b.id);
    const evidence = SCENES.slice(0, st.hero ? 5 : 2).map((scene, i) => ({ run: pick(RUNS.forge), scene, mechanism: pick(MECHANISMS), verdict: i % 4 === 3 ? ("reject" as const) : ("keep" as const), by: "operator" as const }));
    add({
      raw: { kind: "style", vocabulary: { styleId: st.id, derivation: st.derivation }, ...b, ...(hero === undefined ? {} : { media: { sha256: hero.sha, bytes: 180_000, mime: hero.mime } }) },
      f,
      meta: `${st.family} · ${st.derivation}`,
      extras: { prompt: st.recipe, negative: st.negative, observables: st.obs, evidence },
      lineage: [{ role: "origin", ref: { kind: "run", id: f["run"]?.[0] ?? "" }, label: `${st.derivation} · ${f["run"]?.[0] ?? ""}`, facet: { group: "run", value: f["run"]?.[0] ?? "" } }, self(b.id, "style"), { role: "plates", ref: { kind: "style", id: st.id }, label: "plates in this style", facet: { group: "style", value: st.id } }, ...projNodes(f["project"] ?? [])],
      media: hero === undefined ? null : facts(hero),
      ...(st.hero ? {} : { palette: PALETTES[st.obs.palette_strategy] ?? ["#24304a", "#3a2537"] }),
    });
  }

  for (const [kind, n0] of quota) {
    // Plates absorb the rounding and the style quota the nine catalogue styles do not fill.
    const styleQuota = quota.find(([k]) => k === "style")?.[1] ?? 0;
    const n = kind === "plate" ? n0 + (TOTAL - sum) + styleQuota - STYLES.length : kind === "style" ? 0 : kind === "doc" ? n0 - models.length - characters.length : n0;
    for (let i = 0; i < n; i++) {
      if (kind === "image") {
        const deck = r() < 0.5;
        const scene = pick(SCENES);
        const set = deck ? "deck-art" : pick(RUNS.forge);
        const m = deck ? fileBlob(`/deck-art/${pick(DECK)}.webp`, 1600, 1000) : fileBlob(`/trials/google/${pick(TRIAL_STYLES)}/${scene}.jpg`, 1920, 1080);
        const aspect = deck ? ("3:2" as const) : ("16:9" as const);
        const styles = some(TRIAL_STYLES, 1, 2);
        const f: Record<string, string[]> = { set: [set], scene: [scene], style: styles, aspect: [aspect], run: deck ? [] : [set], project: proj() };
        const b = base("image", `${cap(words(scene))} · frame ${String(100 + Math.floor(r() * 9800)).padStart(4, "0")}`, "reference", deck ? "import" : "forge", f, date());
        add({ raw: { kind, vocabulary: { set, scene, styles, aspect }, ...b, media: { sha256: m.sha, bytes: 240_000, mime: m.mime } }, f, meta: `${deck ? "import" : "forge"} · ${scene}`, extras: { file: { w: m.w, h: m.h, path: m.url } }, lineage: [...(deck ? [] : [runNode(set)]), self(b.id, "image"), ...styles.map((s) => ({ role: "styles", ref: { kind: "style" as const, id: s }, label: labelOf("style", s), ...(styleItem.has(s) ? { itemId: styleItem.get(s) ?? "" } : {}) }))], media: facts(m) });
      } else if (kind === "plate") {
        const station = weighted([["forge", 0.6], ["extract", 0.25], ["dojo", 0.15]] as const);
        const st = pick(TRIAL_STYLES);
        const scene = pick(SCENES);
        const missing = r() < 0.006;
        const m = fileBlob(`/trials/google/${st}/${scene}.jpg`, 1920, 1080);
        const style = styleOf(st);
        const run = pick(station === "forge" ? RUNS.forge : station === "extract" ? RUNS.extract : RUNS.dojo);
        const mechanism = pick(MECHANISMS);
        const lesson = station === "dojo" ? pick(LESSONS) : undefined;
        const f: Record<string, string[]> = { style: [st], family: [style?.family ?? "graphic"], station: [station], mechanism: [mechanism], run: [run], project: proj(0.2), ...(lesson === undefined ? {} : { lesson: [lesson] }), ...(missing ? { attention: ["missing"] } : {}) };
        for (const [k, v] of Object.entries(style?.obs ?? {})) f[k] = [v];
        const dark = r() < 0.02;
        const state = weighted([["ratified", 0.26], ["rejected", 0.3], ["unjudged", 0.44]] as const);
        const b = base("plate", `${style?.name ?? st} · ${lesson === undefined ? words(scene) : words(lesson)}`, state, station, f, date());
        add({
          raw: { kind, vocabulary: { station, styleId: st, scene, mechanism, ...(lesson === undefined ? {} : { lesson }), ...(station === "extract" ? { role: r() < 0.6 ? ("replica" as const) : ("transfer" as const) } : {}) }, ...b, ...(missing ? {} : { media: { sha256: m.sha, bytes: 210_000, mime: m.mime } }) },
          f,
          meta: `${mechanism} · s${100 + Math.floor(r() * 900)}`,
          extras: { file: { w: m.w, h: m.h, path: m.url }, run: { id: run } },
          lineage: [runNode(run), self(b.id, "plate"), { role: "style", ref: { kind: "style", id: st }, label: labelOf("style", st), ...(styleItem.has(st) ? { itemId: styleItem.get(st) ?? "" } : {}) }, ...(lesson === undefined ? [] : [{ role: "lesson", ref: { kind: "run" as const, id: run }, label: words(lesson), facet: { group: "lesson", value: lesson } }]), ...projNodes(f["project"] ?? [])],
          media: missing ? null : facts(m, dark ? { meanLuma: 9, nearBlack: true } : {}),
          palette: PALETTES[style?.obs.palette_strategy ?? ""] ?? ["#24304a", "#3a2537"],
        });
      } else if (kind === "motion") {
        const clip = pick(CLIPS);
        const subject = pick(SUBJECTS);
        const format = r() < 0.4 ? ("clip" as const) : ("poster" as const);
        const v = fileBlob(`/clips/presets/${clip}.webm`, 1280, 720);
        const p = fileBlob(`/clips/presets/${clip}.jpg`, 1280, 720);
        const run = RUNS.strips[0];
        const f: Record<string, string[]> = { subject: [subject], format: [format], run: [run], project: proj() };
        const b = base("motion", `${cap(subject)} · E${20 + Math.floor(r() * 80)}${format === "clip" ? " · clip" : ""}`, weighted([["ratified", 0.3], ["rejected", 0.2], ["unjudged", 0.5]] as const), "strips", f, date());
        const main = format === "clip" ? v : p;
        add({ raw: { kind, vocabulary: { subject, format }, ...b, media: { sha256: main.sha, bytes: 400_000, mime: main.mime } }, f, meta: `${format === "clip" ? "webm" : "poster"} · edu-${subject}`, extras: { run: { id: run } }, lineage: [runNode(run), self(b.id, "motion")], media: facts(main, { posterSha: p.sha, durationS: format === "clip" ? 6 : null }), ...(format === "clip" ? { video: v.url } : {}), poster: p.url, palette: pick(Object.values(PALETTES)) });
      } else if (kind === "audio") {
        const type = r() < 0.7 ? ("music" as const) : ("sfx" as const);
        const genre = type === "music" ? some(SOUND.genre, 1, 1) : [];
        const mood = some(SOUND.mood, 1, 2);
        const instrument = some(SOUND.instrument, 1, 3);
        const provider = type === "sfx" ? ("elevenlabs" as const) : weighted([["suno", 0.8], ["local", 0.2]] as const);
        const group = pick(type === "sfx" ? SOUND.sfxGroups : SOUND.musicGroups);
        const stage = pick(SOUND.stages);
        const hunt = r() < 0.2 ? pick(HUNTS).id : undefined;
        const durationS = type === "sfx" ? 2 + Math.floor(r() * 6) : 40 + Math.floor(r() * 160);
        const tempoBpm = type === "music" ? 70 + Math.floor(r() * 70) : undefined;
        const key = type === "music" ? pick(SOUND.keys) : undefined;
        const state = weighted([["ratified", 0.3], ["rejected", 0.38], ["unjudged", 0.32]] as const);
        const f: Record<string, string[]> = { type: [type], genre, mood, instrument, provider: [provider], group: [group], stage: [stage], project: proj(), ...(hunt === undefined ? {} : { hunt: [hunt] }) };
        const b = base("audio", `${cap(mood[0] ?? "warm")} ${genre[0] ?? group} · take ${1 + Math.floor(r() * 40)}`, state, provider === "local" ? "studio" : provider, f, date());
        const seed = out.length;
        const measured = r() < 0.8;
        const dur = `${Math.floor(durationS / 60)}:${String(durationS % 60).padStart(2, "0")}`;
        add({
          raw: { kind, vocabulary: { type, genre, mood, instrument, provider, durationS, ...(tempoBpm === undefined ? {} : { tempoBpm }), ...(key === undefined ? {} : { key }), group, stage }, ...b },
          f,
          meta: [tempoBpm === undefined ? null : `${tempoBpm} bpm`, key ?? null, dur].filter((x) => x !== null).join(" · "),
          extras: {
            audio: {
              prompt: type === "music" ? `${mood.join(", ")} ${genre[0] ?? ""}, ${instrument.join(" and ")}, ${tempoBpm ?? 90} bpm` : `${group}: ${mood[0] ?? "dry"} ${instrument[0] ?? "foley"}, close mic`,
              ...(r() < 0.3 ? { negative: "vocals, crowd noise" } : {}),
              reasons: state === "rejected" ? some(SOUND.reasons, 1, 2) : [],
              facts: { asked: { tempoBpm: tempoBpm ?? null, key: key ?? null, durationS }, measured: measured ? { tempoBpm: tempoBpm === undefined ? null : tempoBpm + (r() < 0.2 ? 6 : 0), key: key ?? null, durationS: durationS + 1, lufs: -14 - Math.round(r() * 60) / 10, truePeakDb: -1 - Math.round(r() * 20) / 10, energy: Math.round(r() * 100) / 100 } : null },
              peaks: peaksOf(seed),
              src: "/library/fixture-tone",
            },
          },
          lineage: [hunt === undefined ? { role: "group", ref: { kind: "run", id: group }, label: group, facet: { group: "group", value: group } } : { role: "hunt", ref: { kind: "run", id: hunt }, label: labelOf("hunt", hunt), facet: { group: "hunt", value: hunt } }, self(b.id, "audio"), ...projNodes(f["project"] ?? [], "project")],
          media: null,
          peaks: peaksOf(seed),
        });
      } else if (kind === "video") {
        const p = pick(PROJECTS);
        const format = r() < 0.6 ? ("music-video" as const) : r() < 0.5 ? ("ad" as const) : ("film" as const);
        const captions = pick(["vtt", "srt", "none"] as const);
        const clip = pick(CLIPS);
        const broken = r() < 0.05;
        const v = fileBlob(broken ? `/clips/presets/${clip}.broken.webm` : `/clips/presets/${clip}.webm`, 1280, 720);
        const poster = fileBlob(`/clips/presets/${clip}.jpg`, 1280, 720);
        const f: Record<string, string[]> = { format: [format], captions: [captions], project: [p.id], ...(broken ? { attention: ["unreadable"] } : {}) };
        const b = base("video", `${p.title.split(" · ")[0] ?? p.title} · ${format === "ad" ? `ad spot ${1 + Math.floor(r() * 12)}` : `cut v${2 + Math.floor(r() * 14)}`}`, weighted([["ratified", 0.4], ["rejected", 0.25], ["unjudged", 0.35]] as const), "studio", f, date());
        add({
          raw: { kind, vocabulary: { format, captions }, ...b, media: { sha256: v.sha, bytes: 2_400_000, mime: v.mime } },
          f,
          meta: `${b.id} · captions ${captions}`,
          extras: { ...(captions === "none" ? {} : { captions: 4 + Math.floor(r() * 30) }) },
          lineage: [...projNodes([p.id], "project"), self(b.id, "video")],
          media: broken ? { ...facts(v), decodable: false, posterSha: null, meanLuma: null, error: "MEDIA_ERR_SRC_NOT_SUPPORTED · ffprobe: Invalid data found when processing input" } : facts(v, { posterSha: poster.sha, durationS: 30 + Math.floor(r() * 90) }),
          ...(broken ? {} : { video: v.url, poster: poster.url }),
          palette: PALETTES[styleOf(p.style)?.obs.palette_strategy ?? ""] ?? ["#24304a", "#3a2537"],
        });
      } else {
        const bundle = pick(BUNDLES);
        const subject = pick(TOPICS[bundle]);
        const techniques = 2 + Math.floor(r() * 18);
        const runId = r() < 0.08 ? pick(RUNS.articles) : undefined;
        const f: Record<string, string[]> = { bundle: [bundle], techniques: [techniqueBand(techniques)], ...(runId === undefined ? {} : { run: [runId] }), project: proj(0.05) };
        const b = base("doc", `${cap(words(subject))} · note ${1 + Math.floor(r() * 24)}`, "reference", "registry", f, r() < 0.3 ? undefined : date());
        add({
          raw: { kind: "doc", vocabulary: { bundle, subject, techniques }, ...b },
          f,
          meta: `${bundle} · ${techniques} techniques`,
          extras: runId === undefined ? {} : { run: { id: runId, stage: "awaiting gate" } },
          lineage: [{ role: "bundle", ref: { kind: "run", id: bundle }, label: bundle, facet: { group: "bundle", value: bundle } }, self(b.id, "document"), ...(runId === undefined ? [] : [{ role: "article", ref: { kind: "run" as const, id: runId }, label: runId, facet: { group: "run", value: runId } }])],
          media: null,
        });
      }
    }
  }
  // The models last, drawing nothing from the stream (fixed dates): the corpus before them is unchanged.
  for (const m of models) {
    const b = { ...base("model", m.title, m.state, "mesh", m.f, m.at), id: m.id };
    add({ raw: { kind: "model", vocabulary: m.vocabulary, ...b, media: m.media }, f: m.f, meta: m.meta, extras: { model: m.extras }, lineage: [runNode(m.night), self(m.id, "model")], media: m.facts, ...(m.poster === undefined ? {} : { poster: m.poster }) });
  }
  // The characters after them, drawing nothing from the stream either: one item per woman, her stills' runs and the styles two of them became in her lineage.
  for (const c of characters) {
    const b = { ...base("character", c.title, c.state, "scout", c.f, c.at), id: c.id, rights: { use: "publishable" as const } };
    const styles = c.styleIds.map((id): LineageNode => ({ role: "look", ref: { kind: "style", id }, label: labelOf("style", id), ...(styleItem.has(id) ? { itemId: styleItem.get(id) ?? "" } : {}) }));
    add({ raw: { kind: "character", vocabulary: c.vocabulary, ...b, media: c.media }, f: c.f, meta: c.meta, extras: { character: c.extras }, lineage: [...c.runs.map(runNode), self(c.id, "character"), ...styles], media: { sha: c.facts.sha, decodable: true, mime: c.facts.mime, w: c.facts.w, h: c.facts.h, durationS: null, posterSha: null, meanLuma: 90, nearBlack: false, probedAt: "2026-10-24T09:00:00.000Z", error: null } });
  }
  return derive(out, r);
}

/** A tenth of the corpus becomes `derived`: same vocabulary, and a lineage node naming its parent. */
function derive(all: FixtureRecord[], r: () => number): FixtureRecord[] {
  return all.map((x, i) => {
    if (i < STYLES.length || x.raw.kind === "model" || x.raw.kind === "character" || r() > 0.1) return x;
    const parent = all.find((p, j) => j < i && p.raw.kind === x.raw.kind && p.raw.source === "fixture");
    if (parent === undefined) return x;
    const f = { ...x.f, source: ["derived"] };
    return {
      ...x,
      f,
      raw: { ...x.raw, source: "derived", lineage: [{ kind: "library-item", id: parent.raw.id }] },
      row: { ...x.row, source: "derived" },
      lineage: [{ role: "derived from", ref: { kind: "library-item", id: parent.raw.id }, label: parent.raw.title, itemId: parent.raw.id }, ...x.lineage],
    };
  });
}

