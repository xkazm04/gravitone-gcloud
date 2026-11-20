// THE STUDIO'S THREE CONTENT FAMILIES as the canvas draws them: each family's stations from idea to publish, the tool
// that runs each and whether it exists today (`exists: false` is drawn as planned). Read off the studio's real
// pipelines on 2026-11-19 (the contest's staged pipelines.json); `x` places a station on the map's shared longitude,
// in stage columns (0 = seed ... 5 = output, 6.5 = the publishing coast).

export type Station = { readonly id: string; readonly name: string; readonly tool: string; readonly exists: boolean; readonly x: number };
export type FamilyKey = "song" | "video" | "reel";
export type Family = { readonly key: FamilyKey; readonly name: string; readonly engine: string; readonly volume: string; readonly stations: readonly Station[] };

const st = (id: string, name: string, tool: string, x: number, exists = true): Station => ({ id, name, tool, exists, x });

export const FAMILIES: Readonly<Record<FamilyKey, Family>> = {
  song: {
    key: "song",
    name: "Songs",
    engine: "Suno v6 + local mastering + the GPU film engine",
    volume: "3 imported takes · 5 finished music videos · one film paused at 1:46 of 3:22",
    stations: [
      st("song-seed", "Song idea / style prompt", "operator + scout seed", 0),
      st("suno-take", "Generation (takes)", "Suno v6", 0.8),
      st("pick", "Take picked", "operator", 1.5),
      st("master", "Mastering", "local pedalboard sidecar", 2.1),
      st("timeline", "Timeline map", "one Gemini call", 2.6),
      st("board-a", "Board A · mood directions", "Leonardo GPT Image 2.5", 3),
      st("board-t", "Board T · treatments", "three.js on the GPU", 3.35),
      st("board-b", "Board B · story per section", "three.js", 3.7),
      st("film", "Film · beat-grid shot plan", "three.js film engine", 4.4),
      st("deliver", "Deliver · 10-bit HEVC", "deliver.mts", 5.75),
      st("publish", "Publish", "YouTube upload via the publish tick", 6.5),
    ],
  },
  video: {
    key: "video",
    name: "Generated video",
    engine: "scout nights → Codex / Leonardo keyframes → MiniMax H3 / LTX-2.5 clips",
    volume: "seeds, ideas and 115 storyboards; channels F1, F2, S1, K1",
    stations: [
      st("seed", "Seed", "scout night", 0),
      st("derived", "Derived seed", "scout night", 1),
      st("idea", "Idea artboard", "scout night", 2),
      st("outline", "Outline accepted", "operator", 2.5),
      st("storyboard", "Storyboard · five frames", "Codex image_gen", 3),
      st("keyframes", "Keyframes", "Leonardo GPT Image 2.5 / Codex", 4),
      st("clips", "Clips", "MiniMax H3 · LTX-2.5", 4.5),
      st("cut", "Cut with sound", "trailer cut.mts", 5),
      st("deliver", "Deliver", "deliver.mts", 5.75),
      st("publish", "Publish", "YouTube upload via the publish tick", 6.5),
    ],
  },
  reel: {
    key: "reel",
    name: "Data reels",
    engine: "a named public table, authored in code, rendered on the local GPU",
    volume: "channels D1 and D2",
    stations: [
      st("outline", "Outline accepted", "operator", 2),
      st("table", "Named source table", "fetch + door", 2.5),
      st("strip", "8 s strip on the Board", "GPU reel renderer", 4),
      st("reel-cut", "Full reel cut", "GPU reel renderer", 5),
      st("deliver", "Deliver", "deliver.mts", 5.75),
      st("publish", "Publish", "YouTube upload via the publish tick", 6.5),
    ],
  },
};

export const FAMILY_ORDER: readonly FamilyKey[] = ["song", "video", "reel"];
