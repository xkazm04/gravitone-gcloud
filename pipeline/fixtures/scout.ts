// THE SCOUT UNIVERSE - two /scout nights in the on-disk shape lib/foundry/scout/store.ts
// documents, for the Floor's pile, the Board's `pkt:scout:<night>` and the Library's
// scout feed (spark media-training-loop):
//
//   fixtures-out/scout/<night>/night.json               the manifest
//   fixtures-out/scout/<night>/sources/s-NN/k-NNN.jpg    a found video's gated keyframes
//   fixtures-out/scout/<night>/scenes/c-NN/replica-N.jpg a scene's replica stills
//   fixtures-out/scout/<night>/assets/c-NN/concept-N.png  a game asset's concepts
//   fixtures-out/scout/<night>/ideas/c-NN.png             an idea's artboard
//   fixtures-out/scout/seeds/<batch>/batch.json           a seed batch (one committed, one open)
//
// Yesterday's night is CLOSED and waits on the Floor; the night before was COMMITTED
// (a scene kept as a poster, a finding kept, a watch line rejected with its reason).
// No style candidate: a scout-owned extract run would leave the extract fixtures'
// own pile, and those fixtures belong to foundry.ts. Yesterday's night also briefed a game asset
// whose mesh asset is the hooded archer ./mesh.ts writes (its `night` is the same day), so the
// fixture Board's scout packet has a `3d` row: two finished variants, poster tiles, a viewer in Z.
// And it drew idea artboards (spark scout-idea-artboards): one per target, each anchored to a
// watchlist line, a registry gap or nothing, and one the studio refused - so the Board's ideas tab
// has tiles above its words, and the gate a loss with the vendor's sentence. Each idea tries a genre, and
// the night proposes one DIRECTION standing on the committed night's kept replica (a words cell in notes).
// And it composed a STORYBOARD (spark scout-storyboards) from the committed night's kept idea: four local
// Flux frames, a paragraph and four bullets - the rung a full video must grow from.
//
// THE MUSE WING (spark scout-muse) has its own root, fixtures-out/scout-muse/, and one CLOSED night on the
// same day as yesterday's scout night - two packets, pkt:scout:<night> and pkt:scout:muse:<night>, one day:
// a style poster, a scene and a character with her card, each still read by the judge as an adult, covered.

import { rmSync } from "node:fs";

import { standConcept } from "../../lib/foundry/scout/concept";
import type { MuseJudge } from "../../lib/foundry/scout/muse";
import type { Asset3dCandidate, DirectionCandidate, IdeaCandidate, Night, SceneCandidate, ScoutSource, Seed, SeedBatch, SeedMusic, StoryboardCandidate } from "../../lib/foundry/scout/types";
import { DAY, HOUR, NOW, outFile, plate, writeBytes, writeJson } from "./kit";

const PALETTE = ["#1d2b3a", "#e0a458", "#5c8a8a", "#f2e8cf"];
const dayOf = (agoMs: number): string => new Date(NOW - agoMs).toISOString().slice(0, 10);
const at = (ms: number): string => new Date(ms).toISOString();

function source(night: string, id: string, title: string, frames: number): ScoutSource {
  const files = Array.from({ length: frames }, (_, i) => `sources/${id}/k-${String(i + 1).padStart(3, "0")}.jpg`);
  for (const f of files) writeBytes(outFile("scout", night, f), plate(`scout:${night}:${f}`, PALETTE, 320, 180));
  return {
    id,
    url: `https://www.youtube.com/watch?v=fixture${id.slice(2)}`,
    kind: "video",
    title,
    channel: "Fixture Studio",
    why: "a long held wide shot with one motivated key",
    found: "search",
    rights: "reference-only",
    status: "ingested",
    files,
    durationS: 142.6,
    at: Object.fromEntries(files.map((f, i) => [f, 2 + i * 1.5])),
  };
}

function scene(night: string, id: string, src: ScoutSource, clip: boolean): SceneCandidate {
  const replicas = [1, 2].map((n) => `scenes/${id}/replica-${n}.jpg`);
  for (const r of replicas) writeBytes(outFile("scout", night, r), plate(`scout:${night}:${r}`, PALETTE, 320, 180));
  return {
    id,
    kind: "scene",
    sourceIds: [src.id],
    status: "rendered",
    jobId: `job:scout-scene:${night}:${id}`,
    keyframes: src.files.slice(0, 3),
    recipe: {
      shot: "wide",
      camera: "low angle, 24mm, subject on the left third",
      motion: "slow push-in; dust drifts right to left",
      composition: "lone figure against a lit doorway",
      lighting: "hard warm key from frame left, cool fill",
      palette: ["deep navy ground", "amber key", "teal fill"],
      rhythm: "long holds, a cut on the settle",
      durationS: 4.5,
      prompt: "wide low-angle shot, lone figure against a lit doorway, hard warm key from the left, cool teal fill",
    },
    replicas,
    ...(clip ? { clipRequested: true as const, error: "clip: the vendor refused this generation" } : {}),
  };
}

function asset(night: string, id: string): Asset3dCandidate {
  const concepts = [`assets/${id}/concept-1.png`, `assets/${id}/concept-2.png`];
  writeBytes(outFile("scout", night, concepts[0] ?? ""), standConcept("character", "canonical"));
  writeBytes(outFile("scout", night, concepts[1] ?? ""), standConcept("character", "game-camera"));
  return {
    id,
    kind: "asset3d",
    sourceIds: [],
    status: "rendered",
    jobId: `job:scout-asset:${night}:${id}`,
    brief: { class: "character", subject: "hooded archer, leather, chunky silhouette", style: "chunky game-camera read, flat leather browns", budgetTris: 40_000, rig: "ue5-mannequin" },
    concepts,
    assetId: "hooded-archer",
    use: "the ranged hero of the starting party",
    serves: { project: "pof" },
  };
}

const IDEA_PALETTE = ["#2b2d42", "#ef8354", "#8d99ae", "#edf2f4", "#4f5d75"];

function idea(night: string, id: string, over: Pick<IdeaCandidate, "title" | "target" | "prompt" | "anchor"> & Partial<IdeaCandidate>): IdeaCandidate {
  const drawn = over.status !== "failed";
  const image = `ideas/${id}.png`;
  if (drawn) writeBytes(outFile("scout", night, image), plate(`scout:${night}:${image}`, IDEA_PALETTE, 384, 384));
  return { id, kind: "idea", sourceIds: [], status: "rendered", jobId: `job:scout-ideas:${night}`, ...(drawn ? { image } : {}), ...over };
}

function direction(id: string, basedOn: readonly string[]): DirectionCandidate {
  return {
    id,
    kind: "direction",
    sourceIds: [],
    status: "rendered",
    title: "Lantern-lit mystery short, slow reveals",
    format: "short",
    genre: "animated mystery short",
    style: "warm amber against cold slate, one motivated key",
    tone: "quiet, uneasy",
    audience: "adults",
    premise: "A night watchman follows a lantern that climbs the stairwell ahead of him, three steps at a time, and never lets him catch up.",
    basedOn,
    use: "a 30-second YouTube Short",
  };
}

function storyboard(night: string, id: string, fromIdea: string): StoryboardCandidate {
  const images = [1, 2, 3, 4].map((k) => `storyboards/${id}/panel-${k}.png`);
  for (const f of images) writeBytes(outFile("scout", night, f), plate(`scout:${night}:${f}`, IDEA_PALETTE, 384, 216));
  return {
    id,
    kind: "storyboard",
    sourceIds: [],
    status: "rendered",
    jobId: `job:scout-storyboard:${night}:${id}`,
    fromIdea,
    title: "The lantern that keeps three steps ahead",
    paragraph: "A night watchman climbs a stairwell after a lantern that will not let him catch it. Each landing is darker than the last, the light always three steps up, until the top floor opens on a window and the lantern hangs outside it, over the city.",
    bullets: [
      "beats: the lantern moves, the chase, the last landing, the window",
      "format: a 30 s vertical short, one shot per beat",
      "audience: adults who like quiet mysteries",
      "look: warm amber against cold slate, one held light, deep shadow below",
    ],
    panels: [
      "rough storyboard frame, a watchman at the foot of a stairwell, a lantern glowing three steps above him, cold slate walls",
      "rough storyboard frame, the watchman mid-climb, the lantern still three steps ahead, his shadow long on the stairs",
      "rough storyboard frame, a dark landing, only the lantern's warm pool of light ahead",
      "rough storyboard frame, an open window at the top of the stairs, the lantern hanging outside over a night city",
    ],
    use: "short: a slow-reveal mystery Short",
    app: "short",
    images,
    seeds: [118, 2307, 4410, 9003],
  };
}

function closedNight(): Night {
  const id = dayOf(DAY);
  const s1 = source(id, "s-01", "Fixture trailer one", 4);
  return {
    id,
    startedAt: at(NOW - DAY - 2 * HOUR),
    deadline: at(NOW - DAY + 6 * HOUR),
    ceilingUsd: 15,
    target: 20,
    clipCap: 2,
    assetCap: 3,
    dry: false,
    state: "closed",
    stop: "sources-exhausted",
    closedAt: at(NOW - DAY + 3 * HOUR),
    sources: [s1],
    candidates: [
      scene(id, "c-01", s1, true),
      { id: "c-02", kind: "finding", sourceIds: [s1.id], status: "rendered", template: "cinematic", step: "02-frames", claim: "Hold a wide shot until the subject settles, then cut.", quote: "the push-in only reads once the figure stops moving" },
      { id: "c-03", kind: "watch", sourceIds: [s1.id], status: "rendered", entry: "channel: Fixture Studio - https://www.youtube.com/@fixture", why: "two usable long takes in one night" },
      asset(id, "c-04"),
      idea(id, "c-05", { title: "Lantern-lit stairwell, the light climbing ahead of the figure", target: "scene", genre: "animated mystery short", anchor: { kind: "watch", ref: "channel: Fixture Studio" }, prompt: "rough storyboard frame, a narrow stairwell lit by one lantern held high, the light reaching three steps ahead of a cloaked figure, deep shadow below, warm amber against cold slate", use: "short: slow-reveal beat for a mystery Short", app: "short", aim: "see whether one held light source carries a reveal as a genre-video baseline" }),
      idea(id, "c-06", { title: "Cut-paper harbour at dusk", target: "style", genre: "music video", anchor: { kind: "gap", ref: "paper-craft looks" }, prompt: "layered cut-paper diorama of a harbour at dusk, visible paper edges and soft drop shadows between layers, five flat tones, no gradients", use: "genre-video: music-video baseline look", app: "genre-video", aim: "extract a new artstyle: paper-craft is a gap in the catalogue" }),
      idea(id, "c-07", { title: "Brass diving helmet with one cracked porthole", target: "asset3d", genre: "game trailer", anchor: { kind: "free", ref: "" }, prompt: "concept sheet of a brass diving helmet, one porthole cracked, rivets and a dented crown, chunky readable silhouette, neutral grey ground", use: "videogame: diving-suit prop for a salvage game", app: "videogame", aim: "fill the prop layer of the asset graph, which holds no diving gear" }),
      idea(id, "c-08", { title: "Rain on a neon market awning", target: "scene", genre: "title opener", anchor: { kind: "watch", ref: "tag: neon noir" }, prompt: "rain sheeting off a striped market awning under neon signs", use: "genre-video: neon-noir title opener", app: "genre-video", aim: "harden the neon-noir style with a rain scene", status: "failed", error: "leonardo answered 429: generation quota exhausted for this hour" }),
      direction("c-09", [`${dayOf(2 * DAY)}/c-01/replica-1`]),
      storyboard(id, "c-10", `${dayOf(2 * DAY)}/c-03`),
    ],
    jobs: ["job:run:scout-ingest:" + id, `job:scout-scene:${id}:c-01`, `job:scout-asset:${id}:c-04`, `job:scout-ideas:${id}`, `job:scout-storyboard:${id}:c-10`],
  };
}

function committedNight(): Night {
  const id = dayOf(2 * DAY);
  const s1 = source(id, "s-01", "Fixture trailer two", 3);
  return {
    id,
    startedAt: at(NOW - 2 * DAY - 2 * HOUR),
    ceilingUsd: 15,
    target: 20,
    clipCap: 2,
    dry: false,
    state: "committed",
    stop: "target",
    closedAt: at(NOW - 2 * DAY + 4 * HOUR),
    sources: [s1],
    candidates: [
      scene(id, "c-01", s1, false),
      { id: "c-02", kind: "watch", sourceIds: [s1.id], status: "rendered", entry: "site: fixture-gallery.example", why: "one coherent look" },
      idea(id, "c-03", { title: "A lantern that climbs the stairs ahead of a watchman", target: "scene", genre: "animated mystery short", anchor: { kind: "free", ref: "" }, prompt: "rough frame, a watchman on a stairwell, a lantern glowing three steps above him, warm amber against cold slate", use: "short: a slow-reveal mystery Short", app: "short", aim: "see whether one moving light carries a whole short" }),
    ],
    jobs: ["job:run:scout-ingest:" + id, `job:scout-scene:${id}:c-01`, `job:scout-ideas:${id}`],
    committed: { at: at(NOW - DAY - 12 * HOUR), by: "operator", kept: ["c-01/replica-1", "c-03/board"], rejected: ["c-01/replica-2", "c-02/text"], reasons: { "c-02/text": ["generic"] }, notes: {}, dry: false },
  };
}

const MUSE_PALETTE = ["#3a2e39", "#d4a373", "#7f5539", "#faedcd", "#588157"];
const read = (apparentAge: number, notes: string): MuseJudge => ({ adult: "yes", apparentAge, clothing: "covered", realPerson: "no", hands: "ok", notes });

function museIdea(night: string, id: string, over: Pick<IdeaCandidate, "title" | "target" | "prompt"> & Partial<IdeaCandidate>): IdeaCandidate {
  const image = `ideas/${id}.png`;
  writeBytes(outFile("scout-muse", night, image), plate(`scout-muse:${night}:${image}`, MUSE_PALETTE, 320, 400));
  return { id, kind: "idea", sourceIds: [], status: "rendered", jobId: `job:scout-ideas:muse:${night}`, anchor: { kind: "free", ref: "" }, aspect: "4:5", image, ...over };
}

function museNight(): Night {
  const id = dayOf(DAY);
  return {
    id,
    startedAt: at(NOW - DAY - HOUR),
    ceilingUsd: 2,
    target: 3,
    clipCap: 0,
    ideaCap: 25,
    dry: false,
    state: "closed",
    stop: "target",
    closedAt: at(NOW - DAY + HOUR),
    sources: [],
    candidates: [
      museIdea(id, "c-01", { title: "Gouache harbour portrait, golden hour", target: "style", genre: "painterly portrait", prompt: "gouache portrait of a woman aged 32 at a harbour wall, golden hour, visible brush texture, warm rim light, wool coat buttoned to the collar", use: "roleplay: painterly portrait avatar", app: "roleplay", aim: "extract a new artstyle: gouache with visible brush texture", judge: read(31, "gouache, warm rim light, flat paper texture") }),
      museIdea(id, "c-02", { title: "A cartographer reading a map by lamplight", target: "scene", genre: "roleplay scene", prompt: "a woman aged 38 bent over a chart table by lamplight, ink and brass instruments, long coat, three-quarter view, cinematic still", use: "roleplay: first-scene backdrop for a cartographer character", app: "roleplay", aim: "learn a lamplit scene as a roleplay setting baseline", judge: read(37, "photoreal, low key, one practical lamp") }),
      museIdea(id, "c-03", {
        title: "Mara Venn, cartographer",
        target: "character",
        genre: "character poster",
        prompt: "character poster of Mara Venn, a woman aged 34, auburn bob, freckles, green wool coat, brass compass on a chain, standing at a chart table, painterly, 4:5",
        use: "dating-sim: first-meeting greeting card", app: "dating-sim", aim: "a character poster technique: a prop that carries her trade", look: "painterly-soft-key",
        card: { name: "Mara Venn", age: 34, look: "auburn bob, freckles, green wool coat, brass compass on a chain", personality: "dry wit, never in a hurry" },
        judge: read(33, "painterly, soft key, the compass reads"),
      }),
    ],
    jobs: [`job:scout-ideas:muse:${id}`],
  };
}

/*
 * Two SEED batches (spark scout-decision-graph), under fixtures-out/scout/seeds/<batch>/batch.json: one the
 * operator committed (two kept, one thrown with its reason and a note), and the next one still open on the Weir,
 * holding a child of a kept seed beside fresh ones. The first batch's music seed predates the `music` facets (spark
 * scout-vision) and carries none; the child, a music seed written after them, carries its song.
 */
const seed = (id: string, sentence: string, genre: string, subgenre: string, type: string, audience: Seed["audience"], format: Seed["format"], parent?: string, music?: SeedMusic): Seed => ({
  id,
  sentence,
  genre,
  subgenre,
  type,
  audience,
  format,
  ...(parent === undefined ? {} : { parent }),
  ...(music === undefined ? {} : { music }),
});

function seedBatches(): SeedBatch[] {
  const first = dayOf(3 * DAY);
  const next = dayOf(DAY);
  return [
    {
      id: first,
      createdAt: at(NOW - 3 * DAY),
      dry: false,
      seeds: [
        seed("sd-001", "A slow tango danced by two coats on a coat rack after the ball.", "music", "tango", "music video", "adult", "video"),
        seed("sd-002", "A shy cloud that rains only on the one flower nobody waters.", "kids animation", "nature friendship", "animated short", "kids", "video"),
        seed("sd-003", "A city skyline at sunset with the title over it.", "trailer", "teaser", "title opener", "family", "short"),
      ],
      committed: { at: at(NOW - 2 * DAY - 6 * HOUR), by: "operator", kept: ["sd-001", "sd-002"], rejected: ["sd-003"], reasons: { "sd-003": ["generic"] }, notes: { "sd-003": "every channel opens on this" }, dry: false },
    },
    {
      id: next,
      createdAt: at(NOW - DAY),
      dry: false,
      seeds: [
        seed("sd-001", "The same tango, its lyrics stitched into the coats' linings verse by verse.", "music", "tango", "lyric video", "adult", "video", `${first}/sd-001`, { instruments: ["bandoneon", "upright bass", "violin"], tempo: 118, mood: "wistful", vocals: "female" }),
        seed("sd-002", "Ten ducklings count themselves across a puddle and forget the one counting.", "kids animation", "preschool counting", "animated short", "kids", "short"),
      ],
    },
  ];
}

export function generate(): string {
  rmSync(outFile("scout"), { recursive: true, force: true });
  rmSync(outFile("scout-muse"), { recursive: true, force: true });
  const nights = [closedNight(), committedNight()];
  for (const n of nights) writeJson(outFile("scout", n.id, "night.json"), n);
  const muse = museNight();
  writeJson(outFile("scout-muse", muse.id, "night.json"), muse);
  const batches = seedBatches();
  for (const b of batches) writeJson(outFile("scout", "seeds", b.id, "batch.json"), b);
  return `${nights.length} scout nights (${nights.map((n) => `${n.id} ${n.state}`).join(", ")}), 1 muse night (${muse.id} ${muse.state}), ${batches.length} seed batches`;
}
