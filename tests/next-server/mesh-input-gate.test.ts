// THE CONCEPT'S INPUT GATE (spark game-3d-assets WP2; lib/foundry/mesh/inputGate.ts) over pixels
// painted here: one subject on a plain field passes; a busy background, two subjects, a subject
// cut by the frame and an empty frame each fail by code; an undecodable concept is unmeasured. The
// real decoder (ffmpeg) is exercised when the box has it.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { admitsMesh, decodeConcept, gradeConcept, INPUT_SIZE, inputGate, type Pixels } from "../../lib/foundry/mesh/inputGate.ts";

const S = INPUT_SIZE;
type RGBA = readonly [number, number, number, number];

function canvas(bg: RGBA | ((x: number, y: number) => RGBA)): Pixels & { paint(x0: number, y0: number, x1: number, y1: number, c: RGBA): void } {
  const rgba = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) rgba.set(typeof bg === "function" ? bg(x, y) : bg, (y * S + x) * 4);
  return {
    width: S,
    height: S,
    rgba,
    paint(x0, y0, x1, y1, c) {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) rgba.set(c, (y * S + x) * 4);
    },
  };
}
const WHITE: RGBA = [245, 245, 245, 255];
const RED: RGBA = [180, 30, 30, 255];
const codes = (g: { fails: readonly string[]; warns: readonly string[] }): string[] => [...g.fails, ...g.warns].map((l) => l.split(":")[0] ?? "");

describe("the gate over pixels", () => {
  it("one subject, whole, on a plain field: pass, and the mesh may launch", () => {
    const c = canvas(WHITE);
    c.paint(90, 30, 166, 226, RED);
    const g = gradeConcept(c);
    expect([g.verdict, g.fails, g.warns]).toEqual(["pass", [], []]);
    expect(g.metrics).toMatchObject({ subjects: 1, borderUniformity: 1 });
    expect(admitsMesh(g)).toBe(true);
  });

  it("a busy background fails `busy-background` and refuses the launch", () => {
    let seed = 7;
    const noise = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed & 0xff);
    const c = canvas(() => [noise(), noise(), noise(), 255]);
    c.paint(90, 30, 166, 226, RED);
    const g = gradeConcept(c);
    expect(g.verdict).toBe("fail");
    expect(codes(g)).toContain("busy-background");
    expect(admitsMesh(g)).toBe(false);
  });

  it("two subjects fail `multiple-subjects`; a speck beside one subject does not", () => {
    const two = canvas(WHITE);
    two.paint(20, 30, 100, 226, RED);
    two.paint(150, 30, 230, 226, [30, 30, 180, 255]);
    const g = gradeConcept(two);
    expect(g.verdict).toBe("fail");
    expect(codes(g)).toEqual(["multiple-subjects"]);
    const speck = canvas(WHITE);
    speck.paint(90, 30, 166, 226, RED);
    speck.paint(200, 200, 203, 203, RED);
    expect(gradeConcept(speck).verdict).toBe("pass");
    expect(gradeConcept(speck).metrics?.["specks"]).toBe(1);
  });

  it("a subject cut by the frame fails `subject-cropped`; one hugging the edge warns `tight-margin`", () => {
    const cut = canvas(WHITE);
    cut.paint(90, 30, 166, S, RED);
    expect(codes(gradeConcept(cut))).toContain("subject-cropped");
    expect(gradeConcept(cut).verdict).toBe("fail");
    const tight = canvas(WHITE);
    tight.paint(90, 2, 166, 226, RED);
    const g = gradeConcept(tight);
    expect([g.verdict, codes(g)]).toEqual(["warn", ["tight-margin"]]);
    expect(admitsMesh(g)).toBe(true);
  });

  it("an empty frame fails `no-subject`", () => {
    expect(codes(gradeConcept(canvas(WHITE)))).toEqual(["no-subject"]);
  });

  it("a transparent field is the plainest background there is", () => {
    const c = canvas([0, 0, 0, 0]);
    c.paint(90, 30, 166, 226, [20, 20, 20, 255]);
    const g = gradeConcept(c);
    expect(g.verdict).toBe("pass");
    expect(g.metrics?.["transparent"]).toBe(true);
  });
});

describe("the gate over a file", () => {
  const tmp = mkdtempSync(path.join(tmpdir(), "gt-mesh-input-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it("a concept the decoder cannot read is UNMEASURED, with the decoder's sentence, and refuses the launch", async () => {
    const g = await inputGate("nowhere.png", async () => ({ ok: false, why: "ffmpeg could not decode the concept: nowhere.png: No such file or directory" }));
    expect(g.verdict).toBe("unmeasured");
    expect(g.warns).toEqual(["unmeasured: ffmpeg could not decode the concept: nowhere.png: No such file or directory"]);
    expect(admitsMesh(g)).toBe(false);
  });

  let ffmpeg = true;
  try {
    execFileSync(process.env["FFMPEG"] ?? "ffmpeg", ["-version"], { stdio: "ignore", windowsHide: true });
  } catch {
    ffmpeg = false;
  }
  it.runIf(ffmpeg)("the real decoder: ffmpeg paints a concept, and the gate reads it as one subject", async () => {
    const file = path.join(tmp, "concept.png");
    execFileSync(process.env["FFMPEG"] ?? "ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=white:s=512x512,drawbox=x=180:y=60:w=150:h=390:color=red@1:t=fill", "-frames:v", "1", file], { windowsHide: true });
    const px = await decodeConcept(file);
    expect(px.ok).toBe(true);
    expect((await inputGate(file)).verdict).toBe("pass");
    writeFileSync(path.join(tmp, "junk.png"), "not a picture");
    expect((await inputGate(path.join(tmp, "junk.png"))).verdict).toBe("unmeasured");
  });
});
