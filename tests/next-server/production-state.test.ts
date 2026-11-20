import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { fixtureProductions } = await import("../../app/(studio)/scout/canvas/_port/fixtureProduction.ts");
const { acceptSwap, getProduction, previewSwap, setVerdict } = await import("../../lib/production/ops.ts");
const { readState, statePath } = await import("../../lib/production/state.ts");
const { clipsPlan, keyframes, keyframesPlan, style, stylePlan } = await import("../../lib/production/draw.ts");
const { eye, parseDrift } = await import("../../lib/production/eye.ts");

// The production headless (spark character-cores S1.5, WP5): one file the canvas and pipeline/production.mts share, and
// the real verbs - style, keyframes, the eye, the clip plan - over a stubbed Codex and a stubbed Fable. Nothing is drawn.

const TAKES = ["K00", "K01", "K02", "K03", "K04", "K05"];
let dir = "";
let was: string | undefined;

const put = (rel: string, body = "x"): void => {
  const f = path.join(dir, rel);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, body);
};

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "production-state-"));
  was = process.env["PRODUCTION_FIXTURE_DIR"];
  process.env["PRODUCTION_FIXTURE_DIR"] = dir;
  put("cores/sofia/portrait.jpg");
  put("cores/sofia/sheet.jpg");
  put("cores/unlatched-lead/portrait.jpg");
  for (const k of TAKES) put(`unlatched/plates/P-${k}.jpg`);
  put("experiment/director/prompts.json", JSON.stringify({ frames: TAKES.map((id) => ({ id, plate: `P-${id}`, prompt: `State of ${id}: she side-steps on the rug.` })) }));
});

afterEach(() => {
  if (was === undefined) delete process.env["PRODUCTION_FIXTURE_DIR"];
  else process.env["PRODUCTION_FIXTURE_DIR"] = was;
  rmSync(dir, { recursive: true, force: true });
});

/** A Codex stand-in: writes the png (and a log) unless the name is in `fail`, recording every call. */
function stubCodex(fail: readonly string[] = []) {
  const calls: { readonly name: string; readonly prompt: string; readonly refs: readonly string[] }[] = [];
  const draw = async (d: string, name: string, prompt: string, refs: string[]): Promise<boolean> => {
    calls.push({ name, prompt, refs });
    mkdirSync(d, { recursive: true });
    writeFileSync(path.join(d, `${name}.log`), "working\nERROR: image_gen refused the request\n");
    if (fail.includes(name)) return false;
    writeFileSync(path.join(d, `${name}.png`), "png");
    return true;
  };
  return { calls, draw };
}

const node = (id: string) => {
  const p = getProduction("unlatched");
  if (!p.ok) throw new Error(p.error.message);
  return p.value.nodes.find((n) => n.id === id);
};

describe("the production's file", () => {
  it("is seeded on first read and shared by the canvas side and the CLI's functions", async () => {
    const s = readState("unlatched");
    if (!s.ok) throw new Error(s.error.message);
    expect(readFileSync(statePath("unlatched"), "utf8")).toContain('"unlatched"');
    expect(acceptSwap({ production: "unlatched", core: "sofia" }).ok).toBe(true);
    const seen = await fixtureProductions.productions();
    if (!seen.ok) throw new Error(seen.error.message);
    expect(seen.value.productions[0]?.cast.id).toBe("chr:sofia");
    const v = await fixtureProductions.productionVerdict({ production: "unlatched", node: "clip:K02", verdict: "keep", reasons: [] });
    expect(v.ok).toBe(true);
    expect(node("clip:K02")?.verdict?.verdict).toBe("keep");
    expect(setVerdict({ production: "unlatched", node: "nope", verdict: "keep", reasons: [] }).ok).toBe(false);
    expect(readState("../x").ok).toBe(false);
  });
});

describe("style", () => {
  it("plans her portrait and sheet in the look, refs her portrait and kept sheet, and records them when drawn", async () => {
    const plan = stylePlan("unlatched", "chr:sofia");
    if (!plan.ok) throw new Error(plan.error.message);
    expect(plan.value.frames.map((f) => f.id)).toEqual(["portrait", "sheet"]);
    expect(plan.value.frames[0]?.refs.map((r) => path.basename(r))).toEqual(["portrait.jpg", "sheet.jpg"]);
    expect(plan.value.frames[1]?.prompt).toMatch(/^Sofia, aged 29: .*Redraw her in this look: The Long Way: .*never who she is\./);
    const codex = stubCodex();
    const r = await style("unlatched", "sofia", codex.draw);
    if (!r.ok) throw new Error(r.error.message);
    expect(codex.calls).toHaveLength(2);
    const s = readState("unlatched");
    expect(s.ok && s.value.styled["chr:sofia"]?.sheet).toContain("sofia%2Fstyled%2Funlatched%2Fsheet.png");
  });

  it("tries a failed frame once more, then answers the log's last sentence", async () => {
    const codex = stubCodex(["sheet"]);
    const r = await style("unlatched", "sofia", codex.draw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("ERROR: image_gen refused the request");
    expect(codex.calls.filter((c) => c.name === "sheet")).toHaveLength(2);
  });
});

describe("keyframes, the eye and the clip plan after a recast", () => {
  it("refuses before the cast is styled, then redraws K00-K05 on the take's plate and her styled sheet", async () => {
    expect(acceptSwap({ production: "unlatched", core: "chr:sofia" }).ok).toBe(true);
    const dry = keyframesPlan("unlatched", {});
    if (!dry.ok) throw new Error(dry.error.message);
    expect(dry.value.refusal).toContain("run style unlatched chr:sofia first");
    expect((await keyframes("unlatched", {}, stubCodex().draw)).ok).toBe(false);

    expect((await style("unlatched", "sofia", stubCodex().draw)).ok).toBe(true);
    const codex = stubCodex(["K04"]);
    const r = await keyframes("unlatched", {}, codex.draw);
    if (!r.ok) throw new Error(r.error.message);
    const planned = r.value.plan.frames;
    expect(planned.map((f) => f.id)).toEqual(TAKES.map((k) => `kf:${k}`));
    expect(planned[0]?.refs.map((x) => path.relative(dir, x).replaceAll("\\", "/"))).toEqual(["unlatched/plates/P-K00.jpg", "cores/sofia/styled/unlatched/sheet.png"]);
    expect(planned[0]?.prompt).toContain("Sofia, aged 29");
    expect(planned[0]?.prompt).toContain("State of K00");
    expect(planned[0]?.prompt).toContain("not the clothes in image 2");
    expect(codex.calls.filter((c) => c.name === "K04")).toHaveLength(2);

    expect(node("kf:K00")).toMatchObject({ state: "made", prompt: planned[0]?.prompt });
    expect(node("kf:K00")?.media?.src).toContain("run=keyframes");
    expect(node("kf:K04")?.state).toBe("failed");
    const s = readState("unlatched");
    expect(s.ok && s.value.failed["kf:K04"]).toBe("ERROR: image_gen refused the request");

    const eyed = await eye("unlatched", {}, async (prompt) =>
      prompt.includes("K01.png") ? { ok: true, reply: "I could not read the image, sorry about that." } : { ok: true, reply: '```json\n{"identity":"holds","room":"drifts","wardrobe":"holds","reason":"the chair moved right of the door"}\n```' },
    );
    if (!eyed.ok) throw new Error(eyed.error.message);
    expect(eyed.value).toHaveLength(5);
    expect(node("kf:K00")?.drift).toEqual({ identity: "holds", room: "drifts", wardrobe: "holds", reason: "the chair moved right of the door", by: "fable-5.2" });
    expect(node("kf:K01")?.drift).toBeUndefined();
    const after = readState("unlatched");
    expect(after.ok && after.value.failed["eye/kf:K01"]).toBe("I could not read the image, sorry about that.");

    const clips = clipsPlan("unlatched");
    if (!clips.ok) throw new Error(clips.error.message);
    expect(clips.value.clips.map((c) => c.take)).toEqual(TAKES);
    expect(clips.value.minutes).toBe(150);
    expect(clips.value.clips[0]?.startState).toBe("made");
  });

  it("a swap's preview shows the frames drawn in this production's look before the experiment's", async () => {
    expect(acceptSwap({ production: "unlatched", core: "sofia" }).ok).toBe(true);
    expect((await style("unlatched", "sofia", stubCodex().draw)).ok).toBe(true);
    expect((await keyframes("unlatched", { ids: ["kf:K00"] }, stubCodex().draw)).ok).toBe(true);
    put("experiment/sofia/K00.png");
    put("experiment/sofia/K01.png");
    expect(acceptSwap({ production: "unlatched", core: "unlatched-lead" }).ok).toBe(true);
    const p = previewSwap({ production: "unlatched", core: "sofia" });
    if (!p.ok) throw new Error(p.error.message);
    expect(p.value.frames.map((f) => f.media?.src.match(/run=(\w+)/)?.[1])).toEqual(["keyframes", "experiment", "unlatched"]);
    expect(p.value.frames.map((f) => f.state)).toEqual(["made", "made", "pending"]);
  });

  it("refuses an id that is not a keyframe", async () => {
    expect(keyframesPlan("unlatched", { ids: ["clip:K00"] }).ok).toBe(false);
  });
});

describe("parseDrift", () => {
  it("takes the object out of a fenced reply, caps the reason and refuses anything else", () => {
    expect(parseDrift(`ok {"identity":"drifts","room":"holds","wardrobe":"holds","reason":"${"r".repeat(200)}"}`)?.reason).toHaveLength(140);
    expect(parseDrift('{"identity":"maybe","room":"holds","wardrobe":"holds","reason":""}')).toBeNull();
    expect(parseDrift("no json here")).toBeNull();
  });
});
