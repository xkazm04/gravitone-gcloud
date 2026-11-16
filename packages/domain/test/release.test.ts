import { describe, expect, it } from "vitest";

import { releaseKind, type Release, type ReleaseTrack } from "../src/release.ts";
import { releaseProblems, releaseReady, rightsWarnings } from "../src/release.problems.ts";
import { parseRelease } from "../src/release.schema.ts";

// Spark audio-distribution S1: the validator every layout's review draws, the release-kind rule and
// the record door. Warnings (rights) never block - the owner's wave-2 ruling.

const track = (over: Partial<ReleaseTrack> = {}): ReleaseTrack => ({
  takeId: "take-1",
  title: "Dancing in the Static",
  version: null,
  isrc: null,
  explicit: false,
  lyrics: null,
  durationS: 200,
  audioHref: null,
  songwriters: ["Jane Doe"],
  credits: [],
  ai: { lyrics: false, music: true, audio: "all", persona: "ai" },
  rights: { vendor: "suno", model: "v5", planTier: "Pro", generatedAt: "2026-11-03", briefDigest: null, reference: null, licence: "commercial" },
  master: { state: "done", recipe: "uni-1", takeId: "take-1-m", audioHref: null, before: { lufs: -9, truePeakDb: 0.2, lra: 6 }, after: { lufs: -14, truePeakDb: -1.1, lra: 5 }, error: null },
  ...over,
});

const release = (over: Partial<Release> = {}): Release => ({
  id: "rel-0123456789ab",
  title: "Misu Vol. 2",
  version: null,
  artist: "MiSu",
  label: null,
  releaseDate: "2026-12-05",
  language: "en",
  genre: { primary: "Pop", secondary: null },
  upc: null,
  tracks: [track()],
  sleeve: { source: "upload", href: null, widthPx: 3000, heightPx: 3000, rgb: true },
  sleevePrompt: null,
  channels: ["youtube"],
  splits: [],
  status: "draft",
  ...over,
});

const codes = (r: Release) => releaseProblems(r).map((p) => `${p.at}:${p.code}`);

describe("releaseProblems", () => {
  it("a complete, mastered, commercial release has no problems", () => {
    expect(releaseProblems(release())).toEqual([]);
  });

  it("featured artists and versions belong outside the title", () => {
    expect(codes(release({ title: "Stay Here (feat. Ana)" }))).toContain("release:title-has-feat");
    expect(codes(release({ tracks: [track({ title: "Stay Here - Radio Edit" })] }))).toContain("track:1:title-has-version");
    expect(codes(release({ title: "Lifted (Remastered)" }))).toContain("release:title-has-version");
  });

  it("an all-AI track must say whether the artist is a person", () => {
    const r = release({ tracks: [track({ ai: { lyrics: true, music: true, audio: "all", persona: null } })] });
    expect(releaseProblems(r)).toContainEqual({ code: "persona-unstated", severity: "block", at: "track:1" });
    expect(releaseReady(releaseProblems(r))).toBe(false);
  });

  it("rights gaps warn and never block", () => {
    const r = release({ tracks: [track({ rights: { vendor: "suno", model: null, planTier: null, generatedAt: null, briefDigest: null, reference: null, licence: "cc-by-nc" } })] });
    const ps = releaseProblems(r);
    expect(ps.map((p) => p.code)).toEqual(["rights-nc-licence", "rights-unknown-tier"]);
    expect(ps.every((p) => p.severity === "warn")).toBe(true);
    expect(releaseReady(ps)).toBe(true);
  });

  it("mastering is not a release problem any more", () => {
    const none = track({ master: { state: "none", recipe: null, takeId: null, audioHref: null, before: null, after: null, error: null } });
    expect(releaseProblems(release({ tracks: [none] }))).toEqual([]);
  });

  it("the sleeve must be square and RGB; under 3000 px only warns", () => {
    expect(codes(release({ sleeve: null }))).toEqual(["sleeve:sleeve-missing"]);
    expect(codes(release({ sleeve: { source: "mv-look", href: null, widthPx: 1920, heightPx: 1080, rgb: false } }))).toEqual(["sleeve:sleeve-not-square", "sleeve:sleeve-too-small", "sleeve:sleeve-not-rgb"]);
    expect(releaseProblems(release({ sleeve: { source: "mv-look", href: null, widthPx: 640, heightPx: 640, rgb: true } }))).toEqual([{ code: "sleeve-too-small", severity: "warn", at: "sleeve" }]);
  });

  it("identifiers are checked only when given", () => {
    expect(codes(release({ upc: "12345" }))).toEqual(["release:upc-malformed"]);
    expect(codes(release({ tracks: [track({ isrc: "US-S1Z-26-00001" })] }))).toEqual([]);
    expect(codes(release({ tracks: [track({ isrc: "US-S1Z-26-1" })] }))).toEqual(["track:1:isrc-malformed"]);
  });

  it("splits add up to 100, and a release needs somewhere to go", () => {
    expect(codes(release({ splits: [{ name: "A", share: 60 }, { name: "B", share: 30 }] }))).toEqual(["splits:splits-not-100"]);
    expect(codes(release({ channels: [] }))).toEqual(["channels:no-channel"]);
  });

  it("songwriters are credited by full name", () => {
    expect(codes(release({ tracks: [track({ songwriters: [] })] }))).toEqual(["track:1:songwriter-missing"]);
    expect(codes(release({ tracks: [track({ songwriters: ["Doe"] })] }))).toEqual(["track:1:songwriter-not-full-name"]);
  });
});

describe("rightsWarnings", () => {
  it("names the tier gap only for vendors whose grant depends on a plan", () => {
    const base = { model: null, generatedAt: null, briefDigest: null, reference: null, licence: "commercial" } as const;
    expect(rightsWarnings({ ...base, vendor: "suno", planTier: null })).toEqual(["rights-unknown-tier"]);
    expect(rightsWarnings({ ...base, vendor: "gravitone-local", planTier: null })).toEqual([]);
    expect(rightsWarnings({ ...base, vendor: null, planTier: null })).toEqual(["rights-unknown-vendor"]);
  });
});

describe("releaseKind", () => {
  const t = (s: number) => ({ durationS: s });
  it("follows the store rule: up to 3 tracks a single, up to 6 an EP, 30 minutes or more an album", () => {
    expect(releaseKind([t(200)])).toBe("single");
    expect(releaseKind([t(200), t(200), t(200), t(200)])).toBe("ep");
    expect(releaseKind(Array.from({ length: 7 }, () => t(100)))).toBe("album");
    expect(releaseKind([t(1000), t(1000)])).toBe("album");
  });
});

describe("parseRelease", () => {
  it("accepts a complete record and refuses one that omits a nullable key", () => {
    expect(parseRelease(release()).ok).toBe(true);
    const { upc: _drop, ...missing } = release();
    expect(parseRelease(missing).ok).toBe(false);
  });
});
