import "server-only";

// THE FIXTURE SCOUT - a generated universe of seed batches and nights that the fixture side hands to the SAME pure
// builder the real side uses (lib/foundry/scout/graph.ts graphOf), so every rule the screen depends on - a verdict
// read off a commit, a pause inherited down a branch, a shared job divided, a group's share - is the builder's,
// not this file's. What it holds, at scale 1 (~300 nodes): a seedless night (before seeds), a batch of 60 seeds
// most of them rejected, a batch of child seeds, an open batch, ideas drawn on kept seeds by one shared job, runs
// developed from kept ideas (a scene whose clip was kept, a style, a game asset, a direction resting on a kept
// cell, a finding), two storyboards composed from kept ideas (one kept, one thrown: the board column), a track
// and its visualizer, a night still open with a pending and a failed render, and one family branch paused. Scale N repeats the universe N times under fresh batch and night ids (`-2`, `-3`...): the
// 10x measure (`SCOUT_FIXTURE_SCALE=10`, read by ./fixture.ts). The muse wing (spark scout-muse) is its own small
// root beside it, never scaled: a committed night of posters and scenes with a kept character and a still the
// judge threw, and a closed night still waiting for its morning.

import type { GraphEffort } from "@gt/domain/scoutGraph";

import type { ScoutBacklog } from "./contract.ts";
import type { Candidate, IdeaCandidate, Night, SeedAudience, SeedBatch, Steer } from "../../../../lib/foundry/scout/types.ts";

export const FIXTURE_NOW = new Date("2026-10-24T07:00:00.000Z");

const GENRES: Readonly<Record<SeedAudience, readonly string[]>> = {
  kids: ["comedy", "adventure", "music"],
  family: ["music", "nature", "mystery"],
  adult: ["horror", "drama", "comedy", "documentary"],
};
const AUDIENCES: readonly SeedAudience[] = ["kids", "family", "adult"];
const TYPES = ["animated comedy sketch", "music video", "lyric video", "data explainer", "short documentary"] as const;
const SUBJECTS = [
  "a lighthouse keeper's cat",
  "two rival snow ploughs",
  "a robot learning to whistle",
  "the last bus of the night",
  "a choir of garden gnomes",
  "a moth in love with a streetlight",
  "a grandmother's radio",
  "a city that sleeps by day",
  "a dragon afraid of matches",
  "the quietest football match",
  "a submarine bakery",
  "a forgotten weather balloon",
] as const;
const REASONS = ["genre", "audience", "done before", "too broad"] as const;

const pick = <T>(xs: readonly T[], i: number): T => xs[i % xs.length] as T;
const pad3 = (i: number): string => String(i).padStart(3, "0");
const pad2 = (i: number): string => String(i).padStart(2, "0");
const iso = (day: string, h: number): string => `${day.slice(0, 10)}T${pad2(h)}:00:00.000Z`;

type Ids = { readonly suffix: string };
const id = (day: string, x: Ids): string => `${day}${x.suffix}`;

type Parent = { readonly ref: string; readonly audience: SeedAudience; readonly genre: string };

function seedBatch(day: string, x: Ids, n: number, at: number, opts: { readonly parentOf?: (i: number) => Parent | undefined; readonly kept?: (i: number) => boolean; readonly open?: true }): SeedBatch {
  const bid = id(day, x);
  const seeds = Array.from({ length: n }, (_, i) => {
    // A child seed narrows its parent: same audience, same genre.
    const from = opts.parentOf?.(i);
    const audience = from?.audience ?? pick(AUDIENCES, i + at);
    const genre = from?.genre ?? pick(GENRES[audience], Math.floor(i / 3) + at);
    const parent = from?.ref;
    return {
      id: `sd-${pad3(i + 1)}`,
      sentence: `A ${genre} ${pick(TYPES, i + at)} for ${audience}: ${pick(SUBJECTS, i * 7 + at)}${parent === undefined ? "" : ", told smaller"}`,
      genre,
      subgenre: `${genre} ${pick(["slapstick", "lullaby", "noir", "road"], i)}`,
      type: pick(TYPES, i + at),
      audience,
      format: i % 4 === 0 ? ("video" as const) : ("short" as const),
      ...(parent === undefined ? {} : { parent }),
    };
  });
  if (opts.open === true) return { id: bid, createdAt: iso(day, 19), dry: false, seeds };
  const kept = seeds.filter((_, i) => opts.kept?.(i) === true).map((s) => s.id);
  const rejected = seeds.filter((s) => !kept.includes(s.id)).map((s) => s.id);
  const reasons = Object.fromEntries(rejected.map((s, i) => [s, [pick(REASONS, i)]]));
  return { id: bid, createdAt: iso(day, 19), dry: false, seeds, committed: { at: iso(day, 23), by: "operator", kept, rejected, reasons, notes: {}, dry: false } };
}

const night = (nid: string, day: string, candidates: Candidate[], over: Partial<Night> = {}): Night => ({
  id: nid,
  startedAt: iso(day, 21),
  ceilingUsd: 15,
  target: 20,
  clipCap: 2,
  dry: false,
  state: "committed",
  closedAt: iso(day, 23),
  sources: [{ id: "s-01", url: "https://example.org/still", kind: "image", title: "A hand-inked harbour at dusk", why: "the ink weight", found: "search", rights: "reference-only", status: "ingested", files: [] }],
  candidates,
  jobs: [],
  ...over,
});

const commitOf = (day: string, kept: string[], rejected: string[]) => ({ at: iso(day, 7), by: "operator", kept, rejected, reasons: Object.fromEntries(rejected.map((c) => [c, ["subject"]])), notes: {}, dry: false });
const cid = (i: number): string => `c-${pad2(i + 1)}`;

function universe(x: Ids): { readonly batches: SeedBatch[]; readonly nights: Night[] } {
  const b1 = seedBatch("2026-10-14", x, 60, 0, { kept: (i) => i % 5 === 0 });
  const keptSeeds = b1.seeds.filter((s) => b1.committed?.kept.includes(s.id) === true);
  const keptRefs = keptSeeds.map((s) => `${b1.id}/${s.id}`);
  const b2 = seedBatch("2026-10-17", x, 24, 1, {
    parentOf: (i) => {
      const p = keptSeeds[Math.floor(i / 2) % keptSeeds.length];
      return p === undefined ? undefined : { ref: `${b1.id}/${p.id}`, audience: p.audience, genre: p.genre };
    },
    kept: (i) => i % 3 === 0,
  });
  const childRefs = (b2.committed?.kept ?? []).map((s) => `${b2.id}/${s}`);
  const b3 = seedBatch("2026-10-23", x, 30, 2, { open: true });

  // Before seeds: a night of found looks, scenes and craft lines.
  const n0 = id("2026-10-12", x);
  const before: Candidate[] = Array.from({ length: 14 }, (_, i): Candidate => {
    const base = { id: cid(i), sourceIds: ["s-01"], status: i === 13 ? ("failed" as const) : ("rendered" as const), ...(i === 13 ? { error: "read: the page refused the fetch (403)" } : {}) };
    if (i % 4 === 0) return { ...base, kind: "style", use: `a ${pick(["riso", "gouache", "ink wash", "paper cut"], i)} look for an explainer` };
    if (i % 4 === 1) return { ...base, kind: "scene", keyframes: [], replicas: [], use: "a cold open on a harbour", jobId: `job:fx-scene:${n0}:${i}` };
    if (i % 4 === 2) return { ...base, kind: "finding", template: "animated-short", step: "02-frames", claim: pick(["Hold a wide for two beats before the gag", "Cut on the blink, not the line", "Keep the horizon on the upper third"], i), quote: "measured" };
    return { ...base, kind: "watch", entry: "an animation channel's process reels", why: "the cut rhythm" };
  });
  const n0Kept = before.filter((c, i) => c.status !== "failed" && i % 3 !== 2).map((c) => (c.kind === "scene" ? `${c.id}/clip` : `${c.id}/text`));
  const n0Rej = before.filter((c, i) => c.status !== "failed" && i % 3 === 2).map((c) => `${c.id}/text`);

  // Ideas on every kept seed (two each), one shared ideas job; a track from the first kids music seed.
  const n1 = id("2026-10-15", x);
  const ideasJob = `job:fx-ideas:${n1}`;
  const ideas: Candidate[] = keptRefs.flatMap((ref, k) =>
    [0, 1].map(
      (j): Candidate => ({ id: cid(k * 2 + j), kind: "idea", sourceIds: [], status: "rendered", title: `${pick(SUBJECTS, k * 2 + j)}, as a ${pick(TYPES, k)}`, target: j === 1 && k % 4 === 0 ? "stats" : "scene", prompt: "p", use: "genre-video: scene baseline", app: "genre-video", aim: "set a scene as a genre-video baseline", anchor: { kind: "free", ref: "" }, fromSeed: ref, jobId: ideasJob }),
    ),
  );
  const music = keptRefs.find((r) => r.endsWith("sd-001")) ?? keptRefs[0] ?? `${b1.id}/sd-001`;
  const track: Candidate = { id: cid(ideas.length), kind: "track", sourceIds: [], status: "rendered", sentence: "A bouncy kids comedy song about a robot learning to whistle", fromSeed: music, clips: [{ part: "a1", path: "tracks/a1.mp3", model: "v6", title: "Whistle Bot", clipId: "sc-fx-1" }], jobId: `job:fx-track:${n1}` };
  const n1Kept = ideas.filter((_, i) => i % 3 !== 2).map((c) => `${c.id}/idea`);
  const n1Rej = ideas.filter((_, i) => i % 3 === 2).map((c) => `${c.id}/idea`);

  // Runs developed from kept ideas; the track's clip visualized; a direction on a kept idea.
  const n2 = id("2026-10-18", x);
  const keptIdeas = ideas.filter((_, i) => i % 3 !== 2);
  const runs: Candidate[] = keptIdeas.map((c, i): Candidate => {
    const from = { fromIdea: `${n1}/${c.id}`, ...(c.fromSeed === undefined ? {} : { fromSeed: c.fromSeed }) };
    const base = { id: cid(i), sourceIds: ["s-01"], status: "rendered" as const, ...from };
    if (i % 3 === 0) return { ...base, kind: "scene", keyframes: [], replicas: [], clipRequested: true, use: "the cold open of the pilot", jobId: `job:fx-scene:${n2}:${i}` };
    if (i % 3 === 1) return { ...base, kind: "style", use: "the series' baseline look", jobId: `job:fx-style:${n2}:${i}` };
    return { ...base, kind: "asset3d", brief: { class: "prop", subject: "a chunky toy lighthouse", budgetTris: 8000 }, concepts: [], use: "a prop for the lighthouse game", jobId: `job:fx-asset:${n2}:${i}` };
  });
  const viz: Candidate = { id: cid(runs.length), kind: "visualizer", sourceIds: [], status: "rendered", track: `${n1}/${track.id}/a1`, fromSeed: music, jobId: `job:fx-viz:${n2}` };
  const dir: Candidate = { id: cid(runs.length + 1), kind: "direction", sourceIds: [], status: "rendered", title: "Animated comedy sketch, deadpan, for kids", format: "short", genre: "comedy", style: "riso", tone: "deadpan", audience: "kids", premise: "A robot learns to whistle and the whole harbour joins in.", basedOn: [`${n1}/${keptIdeas[0]?.id ?? "c-01"}/idea`] };
  const n2Cands = [...runs, viz, dir];
  const n2Kept = n2Cands.filter((_, i) => i % 4 !== 3).flatMap((c) => (c.kind === "scene" ? [`${c.id}/replica-1`, `${c.id}/clip`] : [`${c.id}/v`]));
  const n2Rej = n2Cands.filter((_, i) => i % 4 === 3).map((c) => `${c.id}/v`);
  // Two kept ideas composed as storyboards (spark scout-storyboards): the first kept whole, the second thrown.
  const boards: Candidate[] = keptIdeas.slice(0, 2).map((c, i): Candidate => {
    const sid = cid(n2Cands.length + i);
    return {
      id: sid,
      kind: "storyboard",
      sourceIds: [],
      status: "rendered",
      fromIdea: `${n1}/${c.id}`,
      ...(c.fromSeed === undefined ? {} : { fromSeed: c.fromSeed }),
      title: `${pick(SUBJECTS, i * 2)}, in five frames`,
      paragraph: "p",
      bullets: ["beats", "format", "look"],
      panels: ["p1", "p2", "p3", "p4", "p5"],
      images: [1, 2, 3, 4, 5].map((k) => `storyboards/${sid}/panel-${k}.png`),
      jobId: `job:fx-board:${n2}:${i}`,
    };
  });
  const boardKept = boards.slice(0, 1).flatMap((b) => [`${b.id}/words`, `${b.id}/panel-1`]);
  const boardRej = boards.slice(1).map((b) => `${b.id}/words`);

  // Ideas on the kept child seeds, and a last night still waiting for its morning.
  const n3 = id("2026-10-21", x);
  const childIdeas: Candidate[] = childRefs.map((ref, i): Candidate => ({ id: cid(i), kind: "idea", sourceIds: [], status: i === childRefs.length - 1 ? "failed" : "rendered", ...(i === childRefs.length - 1 ? { error: "studio: the generation was refused (content filter)" } : {}), title: `${pick(SUBJECTS, i + 3)}, smaller`, target: "scene", prompt: "p", use: "short: smaller scene beat", app: "short", aim: "try the kept seed at a smaller scale", anchor: { kind: "free", ref: "" }, fromSeed: ref, jobId: `job:fx-ideas:${n3}` }));
  const n3Kept = childIdeas.filter((c, i) => c.status !== "failed" && i % 2 === 0).map((c) => `${c.id}/idea`);
  const n3Rej = childIdeas.filter((c, i) => c.status !== "failed" && i % 2 === 1).map((c) => `${c.id}/idea`);

  const n4 = id("2026-10-23", x);
  const open: Candidate[] = childIdeas
    .filter((_, i) => i % 2 === 0)
    .slice(0, 6)
    .map((c, i): Candidate => {
      const from = { fromIdea: `${n3}/${c.id}`, ...(c.fromSeed === undefined ? {} : { fromSeed: c.fromSeed }) };
      const status = i === 4 ? ("pending" as const) : i === 5 ? ("failed" as const) : ("rendered" as const);
      return { id: cid(i), sourceIds: ["s-01"], status, ...(status === "failed" ? { error: "comfy: out of memory at 1280x720" } : {}), ...from, kind: "scene", keyframes: [], replicas: [], use: "a second shot for the pilot", jobId: `job:fx-scene:${n4}:${i}` };
    });

  return {
    batches: [b1, b2, b3],
    nights: [
      night(n0, "2026-10-12", before, { committed: commitOf("2026-10-13", n0Kept, n0Rej) }),
      night(n1, "2026-10-15", [...ideas, track], { committed: commitOf("2026-10-16", [...n1Kept, `${track.id}/a1`], n1Rej) }),
      night(n2, "2026-10-18", [...n2Cands, ...boards], { committed: commitOf("2026-10-19", [...n2Kept, ...boardKept], [...n2Rej, ...boardRej]) }),
      night(n3, "2026-10-21", childIdeas, { committed: commitOf("2026-10-22", n3Kept, n3Rej) }),
      night(n4, "2026-10-23", open, { state: "closed" }),
    ],
  };
}

/**
 * The scout wing's backlog the fixture draws: gated (52 kept ideas wait, past BACKLOG_GATE), so a batch takes at
 * most GATED_FRESH_SEEDS fresh seeds. Stated, not counted from the universe above, so the head's gated marks are
 * on screen whatever backlogOf's rule makes of these few nights.
 */
export const FIXTURE_BACKLOG: ScoutBacklog = { waiting: 52, seedsWaiting: 89, gated: true, freshAllowed: 20 };

/** The muse wing's nights: ideas only, each a style, a scene or a character poster at 9:16. */
export function fixtureMuse(): Night[] {
  const judge = (apparentAge: number, clothing: "covered" | "revealing") => ({ adult: "yes" as const, apparentAge, clothing, realPerson: "no" as const, hands: "ok" as const, notes: "painterly, warm rim light" });
  const muse = (i: number, nid: string, over: Pick<IdeaCandidate, "title" | "target"> & Partial<IdeaCandidate>): Candidate => ({ id: cid(i), kind: "idea", sourceIds: [], status: "rendered", prompt: "p", anchor: { kind: "free", ref: "" }, aspect: "9:16", jobId: `job:scout-ideas:muse:${nid}`, ...over });
  const card = { name: "Mara Venn", age: 34, look: "auburn bob, freckles, green wool coat, brass compass on a chain", personality: "dry wit, never in a hurry" };
  const n1 = "2026-10-22";
  const n2 = "2026-10-23";
  const first: Candidate[] = [
    muse(0, n1, { title: "Gouache harbour portrait, golden hour", target: "style", judge: judge(31, "covered") }),
    muse(1, n1, { title: "A detective reading a map by lamplight", target: "scene", judge: judge(38, "covered") }),
    muse(2, n1, { title: "Mara Venn, cartographer", target: "character", use: "dating-sim: first-meeting greeting card", app: "dating-sim", aim: "a character poster technique: a prop that carries her trade", look: "painterly-soft-key", card, judge: judge(33, "covered") }),
    muse(3, n1, { title: "Cel-shaded rooftop chase", target: "scene", status: "failed", error: "judge: adult unsure" }),
  ];
  const second: Candidate[] = [
    muse(0, n2, { title: "Mara Venn at the chart table", target: "character", use: "visual novel: a chart-room sprite", app: "other", aim: "learn a sprite pose against a chart table", look: "chart-room-sprite", card, judge: judge(35, "covered") }),
    muse(1, n2, { title: "Studio-lit 3D concept bust, matte clay", target: "style", judge: judge(42, "covered") }),
    muse(2, n2, { title: "A tango in an empty ballroom", target: "scene", judge: judge(29, "revealing") }),
    muse(3, n2, { title: "Anime market at dusk", target: "scene", status: "pending" }),
  ];
  return [
    night(n1, n1, first, { committed: commitOf("2026-10-23", ["c-01/board", "c-03/board"], ["c-02/board"]) }),
    night(n2, n2, second, { state: "closed" }),
  ];
}

/** The universe `scale` times over. */
export function fixtureUniverse(scale: number): { readonly batches: SeedBatch[]; readonly nights: Night[] } {
  const batches: SeedBatch[] = [];
  const nights: Night[] = [];
  for (let k = 0; k < Math.max(1, scale); k++) {
    const u = universe({ suffix: k === 0 ? "" : `-${k + 1}` });
    batches.push(...u.batches);
    nights.push(...u.nights);
  }
  return { batches, nights };
}

/** The steer the fixture opens with: a split, and the first family seed kept paused. */
export function fixtureSteer(batches: readonly SeedBatch[]): Steer {
  const first = batches[0];
  const family = first?.seeds.find((s) => s.audience === "family" && first.committed?.kept.includes(s.id) === true);
  return {
    split: { audience: { kids: 50, family: 30, adult: 20 }, genre: { kids: { comedy: 60, adventure: 20, music: 20 } } },
    paused: family === undefined || first === undefined ? [] : [`${first.id}/${family.id}`],
    history: [],
  };
}

/** What each job cost, made up but shaped like the kernel's: ideas and track jobs bill the studio and Suno, a scene and an asset hold the GPU. */
export function fixtureEffort(nights: readonly Night[]): Map<string, GraphEffort> {
  const by = new Map<string, number>();
  for (const n of nights) for (const c of n.candidates) if (c.jobId !== undefined) by.set(c.jobId, (by.get(c.jobId) ?? 0) + 1);
  const out = new Map<string, GraphEffort>();
  for (const n of nights) {
    for (const c of n.candidates) {
      const k = c.jobId === undefined ? 1 : (by.get(c.jobId) ?? 1);
      const whole =
        c.kind === "idea" ? { gpuMin: 0, geminiUsd: 0.4, uncappedUsd: 2.4 } : c.kind === "scene" ? { gpuMin: 14, geminiUsd: 0.012, uncappedUsd: 0.06 } : c.kind === "asset3d" ? { gpuMin: 38, geminiUsd: 0, uncappedUsd: 0.12 } : c.kind === "visualizer" ? { gpuMin: 26, geminiUsd: 0, uncappedUsd: 0.05 } : c.kind === "storyboard" ? { gpuMin: 8, geminiUsd: 0, uncappedUsd: 0 } : c.kind === "style" ? { gpuMin: 0, geminiUsd: 0.05, uncappedUsd: 0.9 } : { gpuMin: 0, geminiUsd: 0, uncappedUsd: 0 };
      const r = (v: number): number => Math.round((v / k) * 1e4) / 1e4;
      out.set(`${n.id}/${c.id}`, { runs: 1, gpuMin: r(whole.gpuMin), geminiUsd: r(whole.geminiUsd), uncappedUsd: r(whole.uncappedUsd), ...(k > 1 ? { shared: true as const } : {}) });
    }
  }
  return out;
}
