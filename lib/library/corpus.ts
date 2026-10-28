import { createHash } from "node:crypto";

import type { LibraryExtras, MediaFacts } from "@gt/domain/library";
import { genreLibraryState, LIBRARY_KINDS, NEAR_BLACK_LUMA } from "@gt/domain/library";
import { AppError } from "@gt/domain/errors";
import type { LibraryItemInput as LibraryItem } from "@gt/domain/libraryItem";
import type { IndexContext, LibraryEntry, StyleFacets } from "@gt/kernel/library/core";

// THE 50K CORPUS - the Library's volume proof (plan §6 Phase 5: "prove it at
// 50,000 items with a generated corpus"). The prototype's illustrative fill
// (docs/next/prototype/app/library-data.js) is the template, scaled: the same
// seeded generator (0x5eed2026, its `rnd`), the same FIXED SHARE PER KIND, the
// same vocabularies, so the 50k index has the shape the real one will grow
// into rather than a uniform blob that flatters the planner.
//
// Pure and deterministic: the same `n` and seed give the same items, byte for
// byte, so a latency number names the corpus it was measured on (measurement-
// honesty: speed-figure-names-its-endpoints). Every item is `source: fixture` -
// a generated universe is never real work - and every media item points at a
// synthetic blob sha whose facts are generated too: ~2% missing media, ~1%
// undecodable, ~6% near-black, so the attention facet and the sinking sort are
// exercised at volume, not just in a unit test.

export const CORPUS_SEED = 0x5eed2026;

/** library-data.js `share`, the fixed share per kind. */
export const KIND_SHARE: readonly (readonly [LibraryItem["kind"], number])[] = [
  ["image", 0.17],
  ["plate", 0.37],
  ["style", 0.025],
  ["motion", 0.07],
  ["audio", 0.225],
  ["video", 0.03],
  ["doc", 0.11],
  // Not the prototype's: the game assets (spark game-3d-assets) arrived after it, at a sliver.
  ["model", 0.005],
  // Not the prototype's either: the kept muse characters (spark scout-use-aim).
  ["character", 0.003],
  // And the scout's genres and ventures (spark scout-vision S2): a handful each, as a real store holds.
  ["genre", 0.001],
  ["venture", 0.0005],
];

/** The prototype's PRNG (library-data.js `rnd`), seeded. */
export function prng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OBS: Readonly<Record<string, readonly string[]>> = {
  render_mode: ["photographic", "photoreal-cg", "stylised-realistic", "painterly", "cel-shaded", "graphic-abstract"],
  palette_strategy: ["monochrome", "duotone", "complementary-split", "desaturated-naturalistic", "saturated-vivid", "warm-cool-split"],
  black_handling: ["crushed", "deep-neutral", "lifted-milky"],
  atmospherics: ["none", "light-haze", "heavy-haze", "particulate", "volumetric-shafts"],
  edge_treatment: ["crisp", "soft", "bloom-heavy", "diffused"],
  detail_density: ["sparse", "moderate", "dense", "hyper-dense"],
  surface_realism: ["flat", "simplified", "plausible", "physically-convincing"],
};
const FAMILIES = ["animation", "cinematic", "illustration", "graphic", "game"];
const STYLE_WORDS = ["painted", "ink", "neon", "dusk", "chalk", "paper", "glass", "ember", "noir", "pastel", "woodcut", "halftone", "velvet", "storm", "copper"];
const SCENES = ["lotr-cavalry", "wow-archer", "sw-doorway", "arcane-alley", "matrix-lobby", "night-market", "harbor-dawn", "desert-convoy", "forest-shrine", "rooftop-chase", "lab-console", "throne-room", "rain-street", "ice-cave", "orbital-dock", "village-fire"];
const SETS = ["arcane-fights", "lotr-scene", "matrix-bullets", "swtor-deceived", "wow-shadowlands", "sc2-legacy-void", "spiderman2-be-greater", "wukong-preorder"];
const MECHANISMS = ["text", "ref-early", "ref-late", "img2img", "style-ref"];
const LESSONS = ["counted-beats", "what-stays-dark", "build-key-flip", "reference-sheet", "silhouette-first", "one-light", "edge-hierarchy"];
const SUBJECTS = ["bitcoin", "inflation", "supply-chain", "orbital-mechanics", "photosynthesis", "compound-interest", "tides", "neurons"];
const GENRES = ["ambient", "orchestral", "synthwave", "trip-hop", "drum-and-bass", "lo-fi", "cinematic", "folk", "techno", "jazz"];
const MOODS = ["tense", "warm", "melancholic", "triumphant", "eerie", "playful", "calm", "urgent", "hopeful", "dark"];
const INSTRUMENTS = ["piano", "strings", "synth-pad", "drums", "bass", "guitar", "choir", "brass", "marimba", "cello", "808"];
const KEYS = ["C minor", "A minor", "D major", "F# minor", "E♭ major", "G major", "B♭ minor"];
const SFX_GROUPS = ["risers", "impacts", "whooshes", "ambiences", "ui"];
const BUNDLES = ["software-engineering", "media-generation", "localization"];
const TOPIC_WORDS = ["search", "table", "retry", "caching", "migrations", "facets", "tracing", "queues", "accessibility", "motion", "tokens", "leases", "ledgers", "budgets"];
const MUSE_NAMES = ["Mara", "Sofia", "Hana", "Nadia", "Iris", "Leila", "Katya", "Noor", "Anika", "Rosa"];
const MUSE_BUILDS = ["slim", "slender", "athletic", "lean", "curvy"];
const MUSE_LOOKS = ["risograph-two-colour", "anime-cel", "gouache-portrait", "35mm-anamorphic", "real-time-3d", "ink-wash"];
const MUSE_APPS = ["videogame", "dating-sim", "roleplay", "companion-chat", "genre-video", "short"];
const GENRE_NAMES = ["deadpan office satire", "kitchen-table science", "rooftop noir", "tiny-town documentary", "painted folk tale", "desk-toy physics"];
const LADDER = ["perfecting", "perfecting", "piece-due", "publishable", "retired"] as const;
const PROJECTS = Array.from({ length: 12 }, (_, i) => `proj-${String(i + 1).padStart(2, "0")}`);

const T0 = Date.parse("2025-11-03T00:00:00Z");
const T1 = Date.parse("2026-10-13T20:00:00Z");

export type Corpus = {
  readonly entries: readonly LibraryEntry[];
  readonly facts: readonly MediaFacts[];
  readonly ctx: IndexContext;
};

const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
const cap = (s: string): string => s.replace(/^\w/, (c) => c.toUpperCase());
const words = (s: string): string => s.replace(/-/g, " ");

/** `n` items (default 50,000), the kinds in their fixed shares; plates absorb rounding. */
export function generateCorpus(n = 50_000, seed = CORPUS_SEED): Corpus {
  const rnd = prng(seed);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T;
  const some = <T>(a: readonly T[], lo: number, hi: number): T[] => {
    const k = lo + Math.floor(rnd() * (hi - lo + 1));
    const out = new Set<T>();
    for (let i = 0; i < k * 3 && out.size < k; i++) out.add(pick(a));
    return [...out];
  };
  const weighted = <T>(pairs: readonly (readonly [T, number])[]): T => {
    let r = rnd() * pairs.reduce((s, p) => s + p[1], 0);
    for (const [v, w] of pairs) if ((r -= w) < 0) return v;
    return (pairs[0] as readonly [T, number])[0];
  };
  const date = (): string => new Date(T0 + Math.floor(rnd() * (T1 - T0))).toISOString();
  const seq = (): string => String(100 + Math.floor(rnd() * 9800)).padStart(4, "0");

  // The style catalogue the plates read their family and observables through.
  const styles = new Map<string, StyleFacets>();
  const styleCount = Math.max(27, Math.round(n * 0.025));
  const styleIds: string[] = [];
  for (let i = 0; i < styleCount; i++) {
    const id = `${pick(STYLE_WORDS)}-${pick(STYLE_WORDS)}-${i}`;
    styleIds.push(id);
    const observables = Object.fromEntries(Object.entries(OBS).map(([k, vs]) => [k, pick(vs)]));
    styles.set(id, { name: cap(words(id)), family: pick(FAMILIES), observables });
  }
  const plateStyles = styleIds.slice(0, 60);
  const runs = Array.from({ length: Math.max(20, Math.round(n / 160)) }, (_, i) => `2026-${String(1 + (i % 10)).padStart(2, "0")}-run-${i}`);

  // From 100 items up every kind is drawn at least once (the check below holds it to that), so a
  // sliver share that rounds to nought takes its one item from the plates; at n >= 167 no share
  // rounds to nought and the corpus is the same, byte for byte, as before the floor.
  const quota = KIND_SHARE.map(([k, w]) => [k, n < 100 ? Math.round(n * w) : Math.max(1, Math.round(n * w))] as [LibraryItem["kind"], number]);
  const plateQ = quota.find((q) => q[0] === "plate");
  if (plateQ !== undefined) plateQ[1] += n - quota.reduce((s, q) => s + q[1], 0);

  const entries: LibraryEntry[] = [];
  const facts: MediaFacts[] = [];
  let ordinal = 0;
  const media = (id: string, mime: string): LibraryItem["media"] => {
    if (rnd() < 0.02) return undefined;
    const ref = { sha256: sha(id), bytes: 1000 + Math.floor(rnd() * 900_000), mime };
    const decodable = rnd() >= 0.01;
    const luma = decodable ? (rnd() < 0.06 ? Math.floor(rnd() * NEAR_BLACK_LUMA) : NEAR_BLACK_LUMA + Math.floor(rnd() * 200)) : null;
    const video = mime.startsWith("video/");
    facts.push({
      sha: ref.sha256,
      decodable,
      mime,
      w: decodable ? 1920 : null,
      h: decodable ? 1080 : null,
      durationS: decodable && video ? 2 + Math.floor(rnd() * 60) : null,
      posterSha: decodable && video ? sha(`${id}#poster`) : null,
      meanLuma: luma,
      nearBlack: luma !== null && luma < NEAR_BLACK_LUMA,
      probedAt: "2026-10-17T00:00:00.000Z",
      error: decodable ? null : "moov atom not found",
    });
    return ref;
  };
  const shared = (id: string, title: string, state: LibraryItem["state"], origin: LibraryItem["origin"], project: boolean) => ({
    id,
    title,
    state,
    origin,
    source: "fixture" as const,
    rights: { use: "unknown" as const },
    at: date(),
    collections: project ? [{ kind: "project" as const, id: pick(PROJECTS) }] : [],
  });

  for (const [kind, count] of quota) {
    for (let i = 0; i < count; i++) {
      const id = `${kind}:c${String(++ordinal).padStart(6, "0")}`;
      const proj = rnd() < 0.14;
      let item: LibraryItem;
      let meta: string;
      const extras: { -readonly [K in keyof LibraryExtras]: LibraryExtras[K] } = {};
      if (kind === "image") {
        const scene = pick(SCENES);
        const set = pick(SETS);
        meta = `extract · ${set}`;
        const m = media(id, "image/jpeg");
        item = { kind, ...shared(id, `${cap(words(scene))} · frame ${seq()}`, "reference", "extract", proj), vocabulary: { set, scene, styles: some(plateStyles, 0, 2), aspect: pick(["16:9", "3:2", "4:3", "1:1", "portrait"] as const) }, lineage: [{ kind: "run", id: pick(runs) }], ...(m === undefined ? {} : { media: m }) };
      } else if (kind === "plate") {
        const styleId = pick(plateStyles);
        const station = weighted([["forge", 0.6], ["extract", 0.25], ["dojo", 0.15]] as const);
        const scene = pick(SCENES);
        const mechanism = pick(MECHANISMS);
        meta = `${mechanism} · s${seq()}`;
        const m = media(id, "image/png");
        const run = pick(runs);
        item = {
          kind,
          ...shared(id, `${styles.get(styleId)?.name ?? styleId} · ${station === "dojo" ? words(pick(LESSONS)) : words(scene)}`, weighted([["ratified", 0.26], ["rejected", 0.3], ["unjudged", 0.44]] as const), station, proj),
          vocabulary: { station, styleId, scene, mechanism, ...(station === "dojo" ? { lesson: pick(LESSONS) } : {}) },
          lineage: [{ kind: "run", id: run }],
          ...(m === undefined ? {} : { media: m }),
        };
        extras.run = { id: run };
      } else if (kind === "style") {
        const styleId = pick(styleIds);
        const s = styles.get(styleId);
        meta = `${s?.family ?? ""} · variant`;
        item = {
          kind,
          ...shared(id, `${s?.name ?? styleId} · v${2 + Math.floor(rnd() * 9)}`, weighted([["candidate", 0.82], ["ratified", 0.08], ["rejected", 0.1]] as const), "extract", proj),
          vocabulary: { styleId, derivation: pick(["readback", "authored", "extracted"] as const) },
          lineage: [{ kind: "style", id: styleId }],
        };
        extras.prompt = `${s?.name ?? styleId}: ${words(pick(STYLE_WORDS))} surfaces, ${words(pick(MOODS))} light`;
      } else if (kind === "motion") {
        const subject = pick(SUBJECTS);
        const format = rnd() < 0.7 ? ("poster" as const) : ("clip" as const);
        meta = `${format} · edu-${subject}`;
        const m = media(id, format === "clip" ? "video/mp4" : "image/jpeg");
        item = { kind, ...shared(id, `${cap(words(subject))} · E${20 + Math.floor(rnd() * 80)}`, weighted([["ratified", 0.3], ["rejected", 0.2], ["unjudged", 0.5]] as const), "strips", proj), vocabulary: { subject, format }, lineage: [{ kind: "run", id: pick(runs) }], ...(m === undefined ? {} : { media: m }) };
      } else if (kind === "audio") {
        const type = rnd() < 0.8 ? ("music" as const) : ("sfx" as const);
        const mood = some(MOODS, 1, 2);
        const genre = type === "music" ? [pick(GENRES)] : [];
        const durationS = type === "music" ? 30 + Math.floor(rnd() * 200) : 1 + Math.floor(rnd() * 8);
        const tempo = type === "music" ? 60 + Math.floor(rnd() * 110) : undefined;
        const key = type === "music" ? pick(KEYS) : undefined;
        meta = [tempo === undefined ? null : `${tempo} bpm`, key ?? null, `${Math.floor(durationS / 60)}:${String(durationS % 60).padStart(2, "0")}`].filter((x) => x !== null).join(" · ");
        const m = rnd() < 0.97 ? { sha256: sha(id), bytes: 50_000 + Math.floor(rnd() * 5_000_000), mime: "audio/mpeg" } : undefined;
        item = {
          kind,
          ...shared(id, `${cap(mood[0] ?? "")} ${genre[0] ?? type} · take ${1 + Math.floor(rnd() * 40)}`, weighted([["ratified", 0.3], ["rejected", 0.38], ["unjudged", 0.32]] as const), pick(["suno", "elevenlabs", "studio"] as const), proj),
          vocabulary: {
            type,
            genre,
            mood,
            instrument: some(INSTRUMENTS, 1, 3),
            provider: pick(["suno", "elevenlabs", "local"] as const),
            durationS,
            ...(tempo === undefined ? {} : { tempoBpm: tempo }),
            ...(key === undefined ? {} : { key }),
            ...(type === "sfx" ? { group: pick(SFX_GROUPS) } : {}),
            ...(rnd() < 0.4 ? { stage: pick(["pending", "edit", "remaster", "finalized"] as const) } : {}),
          },
          lineage: [],
          ...(m === undefined ? {} : { media: m }),
        };
        extras.audio = {
          prompt: `${mood.join(", ")} ${genre[0] ?? "sfx"}`,
          reasons: [],
          facts: { asked: { tempoBpm: tempo ?? null, key: key ?? null, durationS }, measured: null },
          peaks: [],
          src: null,
        };
      } else if (kind === "video") {
        const pid = pick(PROJECTS);
        const format = rnd() < 0.7 ? ("music-video" as const) : ("ad" as const);
        meta = `${format}`;
        const m = media(id, "video/mp4");
        item = { kind, ...shared(id, `${pid} · ${format === "ad" ? `ad spot ${1 + Math.floor(rnd() * 12)}` : `cut v${2 + Math.floor(rnd() * 14)}`}`, weighted([["ratified", 0.4], ["rejected", 0.25], ["unjudged", 0.35]] as const), "studio", false), collections: [{ kind: "project", id: pid }], vocabulary: { format, captions: pick(["none", "srt", "vtt"] as const) }, lineage: [{ kind: "project", id: pid }], ...(m === undefined ? {} : { media: m }) };
      } else if (kind === "model") {
        const cls = pick(["character", "weapon", "prop"] as const);
        const technique = pick(["T1", "T2", "M1"] as const);
        const tris = 2000 + Math.floor(rnd() * 50_000);
        meta = `${cls} · ${tris} tris · ${technique}`;
        const m = media(id, "model/gltf-binary");
        item = { kind, ...shared(id, `${cap(pick(SCENES))} asset · ${technique}`, weighted([["ratified", 0.3], ["rejected", 0.3], ["candidate", 0.4]] as const), "mesh", proj), vocabulary: { class: cls, technique, rigged: cls === "character", tris }, lineage: [], ...(m === undefined ? {} : { media: m }) };
      } else if (kind === "character") {
        const age = 25 + Math.floor(rnd() * 26);
        const build = pick(MUSE_BUILDS);
        const looks = some(MUSE_LOOKS, 1, 3);
        meta = `aged ${age} · ${build} build`;
        const m = media(id, "image/png");
        item = { kind, ...shared(id, pick(MUSE_NAMES), "ratified", "scout", false), vocabulary: { age, build, looks, applications: some(MUSE_APPS, 1, 2) }, lineage: [], ...(m === undefined ? {} : { media: m }) };
      } else if (kind === "genre") {
        const ladder = pick(LADDER);
        meta = `${ladder.replace("-", " ")} · ${Math.floor(rnd() * 5)}/4 trials`;
        item = { kind, ...shared(id, pick(GENRE_NAMES), genreLibraryState(ladder), "scout", false), vocabulary: { ladder }, lineage: [] };
      } else if (kind === "venture") {
        const type = rnd() < 0.8 ? ("channel" as const) : ("album" as const);
        meta = `${type} · ${1 + Math.floor(rnd() * 3)} genres`;
        item = { kind, ...shared(id, `${cap(pick(GENRE_NAMES))} ${type}`, "ratified", "scout", false), vocabulary: { type }, lineage: [] };
      } else {
        const bundle = pick(BUNDLES);
        const subject = `${pick(TOPIC_WORDS)}-${pick(TOPIC_WORDS)}`;
        const techniques = 1 + Math.floor(rnd() * 24);
        meta = `${bundle} · ${techniques} techniques`;
        item = { kind: "doc", ...shared(id, `${cap(words(subject))} · note ${1 + Math.floor(rnd() * 24)}`, "reference", "registry", proj), vocabulary: { bundle, subject, techniques }, lineage: [] };
      }
      entries.push({ item, meta, extras, feed: "corpus" });
    }
  }
  const absent = n < 100 ? [] : LIBRARY_KINDS.filter((k) => !entries.some((e) => e.item.kind === k));
  if (entries.length !== n || absent.length > 0) throw new AppError("internal", `corpus: generated ${entries.length} of ${n}${absent.length === 0 ? "" : `, no ${absent.join(", ")}`}`);
  return { entries, facts, ctx: { styleOf: (sid) => styles.get(sid) } };
}
