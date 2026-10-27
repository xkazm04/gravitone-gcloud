// A NIGHT'S MUSIC ON THE BOARD (spark scout-decision-graph WP-S3) - lib/decision/v1/sources/scout.ts over `track`
// and `visualizer` candidates: a track is one run of audio/mpeg cells `c-01/a1..aN` filed under `music` (the audio
// tab), its row the seed's sentence and each clip's meta `track · <genre> › <subgenre> · <N> clips` with its model
// and length; a visualizer one `c-04/video` cell under `videos`, its row the song's title, its still the reference,
// its meta `visualizer · <m:ss> · still: idea|studio`. A track still collecting at close, a failed one and a clip
// not on disk are Losses with their own sentences; an idea grown from a seed names the seed's sentence. The preview
// says what each verdict does - a kept clip's visualizer next night, a kept visualizer the ladder's first rung - and
// the commit writes only the night's record. Every store is a temp directory set below.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-dv1-scout-music-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "store", "gravitone.sqlite");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "foundry-out", "extract");
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "foundry-out", "scout");
  process.env["MESH_STORE_DIR"] = path.join(dir, "foundry-out", "mesh");
  process.env["SCOUT_KNOWLEDGE_DIR"] = path.join(dir, "knowledge");
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  delete process.env["NEXT_PUBLIC_GRAVITONE_DATA"];
  return dir;
});

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { closeKernel } from "../../lib/kernelStore.ts";
import { scoutAdapter } from "../../lib/decision/v1/sources/scout.ts";
import type { Candidate, IdeaCandidate, Night, TrackCandidate } from "../../lib/foundry/scout/types.ts";
import { categoryOf, runsOf, tabOf } from "../../packages/ui/src/board/runs.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const NIGHT = "2026-10-24";
const EARLIER = "2026-10-22";
const SEED = "2026-10-20/sd-001";
const SENTENCE = "A darksynth instrumental for a night drive through a rain-lit city";
const out = path.join(ROOT, "foundry-out");
const blobDir = path.join(ROOT, "blobs");

afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const clip = (cid: string, part: string, model: string, durationS?: number): TrackCandidate["clips"][number] => ({ part, path: `tracks/${cid}/${part}.mp3`, model, title: `Rain Drive (${model}${part === "a2" ? " b" : ""})`, clipId: `sc-${cid}-${part}`, ...(durationS === undefined ? {} : { durationS }) });

function candidates(): Candidate[] {
  const idea: IdeaCandidate = { id: "c-05", kind: "idea", sourceIds: [], status: "rendered", title: "Rain-lit overpass", target: "scene", prompt: "a rain-lit overpass at night", anchor: { kind: "free", ref: "" }, image: "ideas/c-05.png", fromSeed: SEED };
  return [
    { id: "c-01", kind: "track", sourceIds: [], status: "rendered", sentence: SENTENCE, fromSeed: SEED, use: "a video: music video - synthwave › darksynth", sunoJobId: "sj-scout-x", jobId: "job:run:suno.sj-scout-x", clips: [clip("c-01", "a1", "v6", 134), clip("c-01", "a2", "v6"), clip("c-01", "a3", "v6-wild", 121)], error: 'a4: Suno clip "Rain Drive (v6-wild b)" has no audio URL' },
    { id: "c-02", kind: "track", sourceIds: [], status: "pending", sentence: "A lo-fi loop", clips: [], jobId: "job:run:suno.sj-scout-y" },
    { id: "c-03", kind: "track", sourceIds: [], status: "failed", sentence: "A march", clips: [], error: "Suno says: out of credits for v6-wild" },
    { id: "c-04", kind: "visualizer", sourceIds: [], status: "rendered", track: `${EARLIER}/c-07/a2`, fromSeed: SEED, use: "a music video: synthwave › darksynth", mvId: "mj-0000000001", jobId: "job:run:mv.mj-0000000001.1", video: "visualizers/c-04/visualizer.mp4", still: "visualizers/c-04/still.png", durationS: 222 },
    idea,
    { id: "c-06", kind: "visualizer", sourceIds: [], status: "pending", track: `${EARLIER}/c-07/a1`, mvId: "mj-0000000002" },
  ];
}

function seed(): void {
  closeKernel();
  for (const d of ["store", "foundry-out", "catalogue", "knowledge"]) rmSync(path.join(ROOT, d), { recursive: true, force: true });
  mkdirSync(path.join(ROOT, "catalogue"), { recursive: true });
  writeFileSync(path.join(ROOT, "catalogue", "styles.json"), JSON.stringify({ styles: [] }));
  const scout = path.join(out, "scout");
  const seeds = path.join(scout, "seeds", "2026-10-20");
  mkdirSync(seeds, { recursive: true });
  writeFileSync(
    path.join(seeds, "batch.json"),
    JSON.stringify({ id: "2026-10-20", createdAt: "2026-10-20T08:00:00.000Z", dry: false, seeds: [{ id: "sd-001", sentence: SENTENCE, genre: "synthwave", subgenre: "darksynth", type: "music video", audience: "adult", format: "video" }], committed: { at: "2026-10-20T09:00:00.000Z", by: "operator", kept: ["sd-001"], rejected: [], reasons: {}, notes: {}, dry: false } }),
  );
  const dir = path.join(scout, NIGHT);
  for (const sub of ["tracks/c-01", "visualizers/c-04", "ideas"]) mkdirSync(path.join(dir, sub), { recursive: true });
  // a2 is recorded and not on disk.
  for (const p of ["a1", "a3"]) writeFileSync(path.join(dir, "tracks", "c-01", `${p}.mp3`), `ID3 ${p}`);
  writeFileSync(path.join(dir, "visualizers", "c-04", "visualizer.mp4"), "mp4 bytes");
  writeFileSync(path.join(dir, "visualizers", "c-04", "still.png"), "png still");
  writeFileSync(path.join(dir, "ideas", "c-05.png"), "png idea");
  const night: Night = { id: NIGHT, startedAt: `${NIGHT}T00:00:00.000Z`, ceilingUsd: 15, target: 20, clipCap: 2, dry: false, state: "closed", stop: "target", closedAt: `${NIGHT}T05:00:00.000Z`, sources: [], candidates: candidates(), jobs: [] };
  writeFileSync(path.join(dir, "night.json"), JSON.stringify(night));
  // The night whose kept clip the visualizer plays: its song's title and sentence are the visualizer's words.
  mkdirSync(path.join(scout, EARLIER), { recursive: true });
  const earlier: Night = { ...night, id: EARLIER, state: "committed", candidates: [{ id: "c-07", kind: "track", sourceIds: [], status: "rendered", sentence: SENTENCE, clips: [clip("c-07", "a1", "v6", 200), { ...clip("c-07", "a2", "v6-wild", 222), title: "Neon Underpass" }] }] };
  writeFileSync(path.join(scout, EARLIER, "night.json"), JSON.stringify(earlier));
}

const nightOf = (id: string): Night => JSON.parse(readFileSync(path.join(out, "scout", id, "night.json"), "utf8")) as Night;

describe("scout adapter - a track and a visualizer", () => {
  it("draws a track's clips as audio cells under music and a visualizer's video under videos; the rest are losses", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    const { packet, present, urls, losses } = flow.plan;
    expect(packet.items.map((c) => [c.id, c.row, c.media.mime, c.jobId])).toEqual([
      ["c-05/board", "c-05", "image/png", `scout:${NIGHT}`],
      ["c-01/a1", "c-01", "audio/mpeg", "job:run:suno.sj-scout-x"],
      ["c-01/a3", "c-01", "audio/mpeg", "job:run:suno.sj-scout-x"],
      ["c-04/video", "c-04", "video/mp4", "job:run:mv.mj-0000000001.1"],
    ]);
    expect(urls["c-01/a1"]).toBe(`/api/foundry/file?run=${NIGHT}&path=tracks%2Fc-01%2Fa1.mp3&kind=scout`);
    expect(present.rows.find((r) => r.id === "c-01")).toEqual({ id: "c-01", label: SENTENCE, group: "music", use: "a video: music video - synthwave › darksynth" });
    expect(present.items["c-01/a1"]).toEqual({ label: "Rain Drive (v6)", meta: "track · synthwave › darksynth · 3 clips · v6 · 2:14", music: true });
    expect(present.items["c-01/a3"]?.meta).toBe("track · synthwave › darksynth · 3 clips · v6-wild · 2:01");
    expect(present.rows.find((r) => r.id === "c-04")).toEqual({ id: "c-04", label: "Neon Underpass", group: "videos", use: "a music video: synthwave › darksynth", ref: `/api/foundry/file?run=${NIGHT}&path=visualizers%2Fc-04%2Fstill.png&kind=scout` });
    expect(present.items["c-04/video"]).toEqual({ label: "Neon Underpass", meta: "visualizer · 3:42 · still: idea", prompt: SENTENCE });
    // The idea grown from the seed names it.
    expect(present.items["c-05/board"]?.meta).toBe("scene · free · seed: A darksynth instrumental for a night…");
    expect(losses).toEqual([
      { candidate: "c-01/a2", grade: "dropped", reason: "tracks/c-01/a2.mp3 is not on disk" },
      { candidate: "c-01", grade: "approximate", reason: 'a4: Suno clip "Rain Drive (v6-wild b)" has no audio URL' },
      { candidate: "c-02", grade: "dropped", reason: "still collecting when the night closed: nothing to judge" },
      { candidate: "c-03", grade: "dropped", reason: "Suno says: out of credits for v6-wild" },
      { candidate: "c-06", grade: "dropped", reason: "still collecting when the night closed: nothing to judge" },
    ]);
  });

  it("previews a kept clip as next night's visualizer and a kept visualizer as the ladder's first rung; commits only the record", async () => {
    seed();
    const flow = await openFlow(scoutAdapter, NIGHT, blobDir);
    flow.patch([
      { candidate: "c-01/a1", verdict: "keep" },
      { candidate: "c-01/a3", verdict: "reject", reasons: ["craft"], note: "muddy low end" },
      { candidate: "c-04/video", verdict: "keep" },
      { candidate: "c-05/board", verdict: "keep" },
    ]);
    const p = must(flow.preview()).consequence;
    const record = `foundry-out/scout/${NIGHT}/night.json`;
    expect(p.writes).toEqual([
      { kind: "file", target: record, candidate: "c-01/a1", detail: "the next night renders its visualizer" },
      { kind: "file", target: record, candidate: "c-01/a3", detail: "rejected: craft" },
      { kind: "file", target: record, candidate: "c-04/video", detail: "rung 1 of the music ladder: the full video and its Short are next" },
      { kind: "file", target: record, candidate: "c-05/board", detail: "develops next night as a scene" },
      { kind: "file", target: record, detail: "committed: every verdict, its reasons and its note" },
    ]);
    must(flow.commit());
    must(await scoutAdapter.apply(flow.claim()));
    expect(nightOf(NIGHT)).toMatchObject({ state: "committed", committed: { dry: false, kept: ["c-05/board", "c-01/a1", "c-04/video"], rejected: ["c-01/a3"], reasons: { "c-01/a3": ["craft"] }, notes: { "c-01/a3": "muddy low end" } } });
  });

  it("files a track run in the audio tab and a visualizer in videos", () => {
    const runs = runsOf([{ id: "c-01/a1", row: "c-01" }, { id: "c-04/video", row: "c-04" }], [{ id: "c-01", label: SENTENCE, group: "music" }, { id: "c-04", label: "Neon Underpass", group: "videos" }]);
    const [track, video] = runs;
    if (track === undefined || video === undefined) throw new Error("two runs");
    expect([categoryOf(track, "audio/mpeg"), tabOf(categoryOf(track, "audio/mpeg"))]).toEqual(["music", "audio"]);
    expect([categoryOf(video, "video/mp4"), tabOf(categoryOf(video, "video/mp4"))]).toEqual(["videos", "videos"]);
  });
});
