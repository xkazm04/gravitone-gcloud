// THE SUNO STATION'S PURE PARTS (spark suno-covers WP2): the plan a form makes (an untouched control is an omitted key,
// never a 0 and never null), the five steps of a send read off its record, the station's place on the groove and the
// desk's re-read while a send is in flight. No DOM: the station's drawing is driven on a dev server by the fixtures.
import { describe, expect, it } from "vitest";

import type { CoverRecord } from "@gt/domain/cover";
import type { CoverSunoSend } from "@gt/domain/cover.suno";

import { inFlight } from "../../app/(studio)/audio/_cover/desk/brief/brief.ts";
import { frontier, reachedOf, STATIONS } from "../../app/(studio)/audio/_cover/desk/sleeve/stations.ts";
import { durationOf, formOf, newestFirst, planFacts, planOf, sendable, stepsOf } from "../../app/(studio)/audio/_cover/desk/suno/suno.ts";

const base: CoverRecord = {
  id: "cov-1",
  createdAt: "2026-11-10T10:00:00.000Z",
  title: "Salt Road",
  rights: "own",
  source: { file: "source.mp3", mime: "audio/mpeg", name: "salt-road.mp3", durationS: 190 },
  section: { startS: 0, endS: 190 },
  style: "lo-fi hip hop",
  lyrics: "",
  state: "picked",
  takes: [],
};

const send = (over: Partial<CoverSunoSend> = {}): CoverSunoSend => ({ n: 1, at: "2026-11-10T11:00:00.000Z", jobId: "job:cover-suno:cov-1:1", state: "running", plan: { style: "x", lyrics: "", model: "v6" }, takes: [], ...over });

describe("the form's plan", () => {
  it("starts from the remix's style, else the cover's, and the cover's lyrics", () => {
    expect(formOf(base)).toMatchObject({ style: "lo-fi hip hop", lyrics: "", model: "v6" });
    expect(formOf({ ...base, lyrics: "la", remix: { file: "r.mp3", mime: "audio/mpeg", name: "r.mp3", style: "synthwave" } })).toMatchObject({ style: "synthwave", lyrics: "la" });
  });

  it("omits every control left alone: an absent key, not a 0, not null", () => {
    const plan = planOf("cov-1", formOf(base));
    expect(plan).toEqual({ id: "cov-1", style: "lo-fi hip hop", lyrics: "", model: "v6" });
    expect("controls" in plan).toBe(false);
    expect("durationS" in plan).toBe(false);
    expect("negativeStyle" in plan).toBe(false);
  });

  it("sends a touched control as its fraction, and a touched 0 as the 0 it is", () => {
    const f = { ...formOf(base), weirdness: 0, audioInfluence: 60, variety: 0 as const, negativeStyle: " autotune ", duration: "180", model: "v6-wild" as const };
    expect(planOf("cov-1", f)).toEqual({ id: "cov-1", style: "lo-fi hip hop", lyrics: "", model: "v6-wild", negativeStyle: "autotune", durationS: 180, controls: { audioInfluence: 0.6, weirdness: 0, variety: 0 } });
  });

  it("holds a target length to Suno's 15-360 s, and a send to a style", () => {
    expect(durationOf("")).toBeUndefined();
    expect(durationOf("15")).toBe(15);
    expect(durationOf("360")).toBe(360);
    expect(Number.isNaN(durationOf("14"))).toBe(true);
    expect(Number.isNaN(durationOf("361"))).toBe(true);
    expect(Number.isNaN(durationOf("2.5"))).toBe(true);
    expect(sendable({ ...formOf(base), duration: "10" })).toBe(false);
    expect(sendable({ ...formOf(base), style: "  " })).toBe(false);
    expect(sendable(formOf(base))).toBe(true);
  });

  it("names a sent plan's model and controls, and says instrumental for empty lyrics", () => {
    const labels = planFacts({ style: "x", lyrics: "", model: "v6-mini", durationS: 75, controls: { variety: 3, styleInfluence: 0.25 } }).map((f) => `${f.label}${f.value === undefined ? "" : ` ${f.value}`}`);
    expect(labels).toEqual(["v6-mini", "style 25 %", "variety Extra", "target 1:15", "instrumental"]);
  });
});

describe("the steps of a send", () => {
  const take = (n: 1 | 2, over: object = {}) => ({ take: n, state: "complete" as const, clipId: `c${n}`, ...over });
  const state = (s: CoverSunoSend, up: string | null = "up") => stepsOf(s, up ?? undefined).map((x) => `${x.key}:${x.state}`);

  it("runs upload, cover 1, cover 2, read 1, read 2 and marks the first one still to do", () => {
    expect(state(send({ takes: [take(1), { take: 2, state: "pending" }] }))).toEqual(["upload:done", "cover 1:done", "cover 2:running", "read 1:pending", "read 2:pending"]);
    expect(state(send({ state: "queued" }), null)).toEqual(["upload:pending", "cover 1:pending", "cover 2:pending", "read 1:pending", "read 2:pending"]);
    expect(state(send({ state: "running" }), null)[0]).toBe("upload:running");
  });

  it("counts a refused read as read: the take stands", () => {
    const s = send({ state: "done", takes: [take(1, { read: { at: "t", status: "complete", sections: [], terms: [], labels: [] } }), take(2, { readRefused: "no" })] });
    expect(state(s).every((x) => x.endsWith(":done"))).toBe(true);
  });

  it("marks a refused cover failed and a failed send's first open step failed", () => {
    expect(state(send({ state: "failed", takes: [take(1), { take: 2, state: "failed", error: "refused" }] }))).toEqual(["upload:done", "cover 1:done", "cover 2:failed", "read 1:pending", "read 2:pending"]);
    expect(state(send({ state: "failed" }), null)[0]).toBe("upload:failed");
  });
});

describe("the station on the groove", () => {
  it("sits between the winner and the remix and opens for a picked cover only", () => {
    expect(STATIONS.slice(-3)).toEqual(["winner", "suno", "remix"]);
    expect(reachedOf(base).suno).toBe(true);
    expect(reachedOf({ ...base, state: "judging" }).suno).toBe(false);
  });

  it("is where a sent cover stands until a remix from elsewhere is uploaded", () => {
    expect(frontier(base)).toBe("winner");
    expect(frontier({ ...base, suno: { sends: [send({ state: "done" })] } })).toBe("suno");
    const byHand = { file: "r.mp3", mime: "audio/mpeg", name: "r.mp3", style: "s" };
    expect(frontier({ ...base, remix: byHand, suno: { sends: [send({ state: "done" })] } })).toBe("remix");
    expect(frontier({ ...base, remix: { ...byHand, sunoClipId: "c2" }, suno: { sends: [send({ state: "done" })] } })).toBe("suno");
  });

  it("keeps the desk re-reading while a send is queued or running", () => {
    expect(inFlight({ ...base, suno: { sends: [send({ state: "queued" })] } })).toBe(true);
    expect(inFlight({ ...base, suno: { sends: [send({ state: "running" })] } })).toBe(true);
    expect(inFlight({ ...base, suno: { sends: [send({ state: "done" })] } })).toBe(false);
    expect(inFlight(base)).toBe(false);
  });

  it("lists the newest send first", () => {
    expect(newestFirst({ sends: [send({ n: 1 }), send({ n: 3 }), send({ n: 2 })] }).map((x) => x.n)).toEqual([3, 2, 1]);
  });
});
