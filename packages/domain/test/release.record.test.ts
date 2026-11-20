import { describe, expect, it } from "vitest";

import { parseProposalPath } from "../src/release.record.ts";
import { applyProposal, parseReleaseRecord } from "../src/release.record.schema.ts";
import type { Release } from "../src/release.ts";

// Spark studio-to-release: a proposal is validated by applying it and re-parsing the whole release through the door.

const release: Release = {
  id: "rel-0123456789ab",
  title: "Dancing in the Static",
  version: null,
  artist: "MiSu",
  label: null,
  releaseDate: null,
  language: "en",
  genre: { primary: "Electronic", secondary: null },
  upc: null,
  tracks: [
    {
      takeId: "take-1",
      title: "Dancing in the Static",
      version: null,
      isrc: null,
      explicit: false,
      lyrics: null,
      durationS: 282,
      audioHref: null,
      songwriters: [],
      credits: [],
      ai: { lyrics: false, music: true, audio: "all", persona: null },
      rights: { vendor: "suno", model: null, planTier: null, generatedAt: null, briefDigest: null, reference: null, licence: "unknown" },
      master: { state: "none", recipe: null, takeId: null, audioHref: null, before: null, after: null, error: null },
    },
  ],
  sleeve: null,
  sleevePrompt: null,
  channels: [],
  splits: [],
  status: "draft",
};

describe("proposal paths", () => {
  it("names release fields and 1-based track fields, nothing else", () => {
    expect(parseProposalPath("genre.secondary")).toEqual({ track: null, field: "genre.secondary" });
    expect(parseProposalPath("track:1.lyrics")).toEqual({ track: 1, field: "lyrics" });
    expect(parseProposalPath("track:0.lyrics")).toBeNull();
    expect(parseProposalPath("status")).toBeNull();
    expect(parseProposalPath("track:1.master")).toBeNull();
  });
});

describe("applyProposal", () => {
  it("applies a value the release can hold", () => {
    const r = applyProposal(release, "genre.secondary", "Ambient");
    expect(r.ok && r.value.genre).toEqual({ primary: "Electronic", secondary: "Ambient" });
    const t = applyProposal(release, "track:1.lyrics", "static on the line");
    expect(t.ok && t.value.tracks[0]?.lyrics).toBe("static on the line");
  });

  it("refuses what the release door refuses, and a track past the last", () => {
    expect(applyProposal(release, "genre.primary", "Polka").ok).toBe(false);
    expect(applyProposal(release, "track:1.ai", { lyrics: true }).ok).toBe(false);
    expect(applyProposal(release, "track:2.lyrics", "x").ok).toBe(false);
  });
});

describe("parseReleaseRecord", () => {
  it("holds a record with a pending proposal, and refuses version 0", () => {
    const rec = { release, version: 1, sessionId: null, createdAt: "t", updatedAt: "t", pending: [{ id: "p-1", path: "track:1.lyrics", value: "x", source: "the Suno lyrics", turnId: null, at: "t" }] };
    expect(parseReleaseRecord(rec).ok).toBe(true);
    expect(parseReleaseRecord({ ...rec, version: 0 }).ok).toBe(false);
    expect(parseReleaseRecord({ ...rec, pending: [{ ...rec.pending[0], path: "status" }] }).ok).toBe(false);
  });
});
