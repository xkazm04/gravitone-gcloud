import { describe, expect, it } from "vitest";

import { factsOf, lumaOf } from "../src/media-facts/core.ts";

// The pure half of the media-facts producer, on recorded ffprobe output (the
// end-to-end run on real ffmpeg is tests/next-server/library-media-facts.test.ts).

const SHA = "a".repeat(64);
const AT = "2026-10-17T00:00:00.000Z";
const VIDEO = JSON.stringify({ streams: [{ codec_type: "video", width: 1920, height: 1080, duration: "4.004000" }, { codec_type: "audio" }], format: { duration: "4.010000" } });
const IMAGE = JSON.stringify({ streams: [{ codec_type: "video", width: 640, height: 400 }], format: { format_name: "png_pipe" } });

describe("factsOf", () => {
  it("reads a video's size and duration, keeps its poster and measures near-black under 16", () => {
    const f = factsOf({ sha: SHA, mime: "video/mp4", probe: { ok: true, json: VIDEO }, luma: 9, posterSha: "b".repeat(64), at: AT });
    expect(f).toEqual({ sha: SHA, mime: "video/mp4", probedAt: AT, decodable: true, w: 1920, h: 1080, durationS: 4.004, posterSha: "b".repeat(64), meanLuma: 9, nearBlack: true, error: null });
  });
  it("gives a still no duration, and 16 exactly is not near-black", () => {
    const f = factsOf({ sha: SHA, mime: "image/png", probe: { ok: true, json: IMAGE }, luma: 16, posterSha: null, at: AT });
    expect(f).toMatchObject({ decodable: true, w: 640, h: 400, durationS: null, meanLuma: 16, nearBlack: false });
  });
  it("calls a blob undecodable with the probe's words, or when it has no stream of its kind", () => {
    expect(factsOf({ sha: SHA, mime: "video/mp4", probe: { ok: false, error: "moov atom not found" }, luma: null, posterSha: null, at: AT })).toMatchObject({
      decodable: false,
      error: "moov atom not found",
      nearBlack: false,
    });
    const audioOnly = JSON.stringify({ streams: [{ codec_type: "audio", duration: "3" }] });
    expect(factsOf({ sha: SHA, mime: "video/mp4", probe: { ok: true, json: audioOnly }, luma: null, posterSha: null, at: AT }).error).toContain("no video stream");
    expect(factsOf({ sha: SHA, mime: "video/mp4", probe: { ok: true, json: "{not json" }, luma: null, posterSha: null, at: AT }).decodable).toBe(false);
  });
  it("leaves luma unknown, never zero, when it could not be taken", () => {
    const f = factsOf({ sha: SHA, mime: "image/png", probe: { ok: true, json: IMAGE }, luma: null, posterSha: null, at: AT });
    expect(f).toMatchObject({ meanLuma: null, nearBlack: false });
    expect(lumaOf(new Uint8Array([]))).toBeNull();
    expect(lumaOf(new Uint8Array([200]))).toBe(200);
  });
});
