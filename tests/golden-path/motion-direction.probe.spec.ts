// LANE — THE MOTION-DIRECTION TURN (video-clip-pipeline-B, stage 1).
//
// pipeline/video/motion_author.py READS a still (what is in it, named, placed)
// and then PROPOSES motion for the named things. Its own README records the
// gap this turn closes: the author "cannot decline". A plate with nothing that
// can move on its own — a flat gradient, a texture, one fused shape — still got
// a prompt, and a prompt with no separable subject is a camera drift, which is
// the defect the author was written to stop.
//
// So the product turn has two outcomes, and both are states:
//
//   proposed — a `FrameClip.motion` line, carried with its BASIS: the scene the
//              read saw, the elements, which moved and how, who read it;
//   declined — a reason, and `FrameClip.motion` stays "". In the registry's
//              words (video-assembly#generated-shot-sourcing, rung zero): a
//              shot that cannot say what should move is a rung-zero shot, and
//              the editor's move is its motion.
//
// Every case runs the REAL turn over a FAKE `recognize` — no vision call, no
// network. The fake records what it was asked, so the cases can also pin that
// a decline spends exactly one call and that the proposal pass is handed the
// reading it must stay inside.

import { test, expect } from "@playwright/test";

import { emptyClip, type Frame } from "@/app/_phases/frames/frames";
import {
  acceptIntoFramesRecord,
  clipAfter,
  directMotion,
  motionReport,
  withAcceptedMotion,
  type MotionOutcome,
} from "@/app/_phases/motion/direction";
import { POST as directPOST } from "@/app/api/motion/direct/route";
import { ACCESS_SECRET_VAR, __resetRateLimit } from "@/lib/apiAuth";
import type { Recognition, RecognizeRequest } from "@/lib/imaging/types";

import { keepEnv } from "./_helpers";

keepEnv([ACCESS_SECRET_VAR]);

const PLATE = { base64: "iVBORw0KGgo=", mime: "image/png" as const };

/** A recognize that answers from a script, one JSON per call, and keeps the asks. */
function fakeRecognize(...answers: unknown[]) {
  const asked: RecognizeRequest[] = [];
  const fn = async (req: RecognizeRequest): Promise<Recognition> => {
    asked.push(req);
    const json = answers[asked.length - 1];
    if (json === undefined) throw new Error(`fake recognize: no scripted answer for call ${asked.length}`);
    return {
      text: JSON.stringify(json),
      json,
      provenance: { provider: "ollama", model: "qwen3.8:27b", modelBasis: "requested", durationMs: 12 },
    };
  };
  return { fn, asked };
}

const read = (elements: { name: string; where: string; separable: boolean }[], scene = "a flat vector chart on cream paper") => ({
  scene,
  elements,
  grounded: true,
});

function frame(id: string, motion = ""): Frame {
  return {
    id,
    at: "0:00",
    atS: 0,
    kind: "hook",
    title: `Beat ${id}`,
    line: "",
    plate: { state: "ready", src: `data:image/png;base64,${PLATE.base64}` },
    clip: { ...emptyClip(), motion },
    elements: [],
    texts: [],
  } as Frame;
}

test("case 2: a plate with no separable element is DECLINED with a reason, and FrameClip.motion stays empty", async () => {
  const r = fakeRecognize(read([], "a smooth blue-to-violet gradient with no objects"));
  const out = await directMotion(PLATE, r.fn);

  expect(out.kind).toBe("declined");
  if (out.kind !== "declined") return;
  expect(out.reason.trim().length).toBeGreaterThan(0);
  expect(out.basis.scene).toBe("a smooth blue-to-violet gradient with no objects");
  // Declined on the reading alone: the proposal pass is never paid for.
  expect(r.asked).toHaveLength(1);

  const clip = clipAfter(emptyClip(), out);
  expect(clip.motion).toBe("");
  expect(clip.status).toBe("not-started");
});

test("case 2b: elements the read marks inseparable (texture, background) do not count — still declined", async () => {
  const r = fakeRecognize(
    read([
      { name: "paper grain", where: "everywhere", separable: false },
      { name: "vignette", where: "edges", separable: false },
    ]),
  );
  const out = await directMotion(PLATE, r.fn);
  expect(out.kind).toBe("declined");
  expect(r.asked).toHaveLength(1);
});

test("case 2c: a proposal that moves only the camera, or a thing the read never named, is declined", async () => {
  const seen = read([{ name: "tallest bar", where: "centre right", separable: true }]);
  for (const moves of [[{ element: "camera", verb: "pushes in" }], [{ element: "the sun", verb: "rises" }]]) {
    const r = fakeRecognize(seen, { prompt: "The camera pushes in.", moves, holds_still: [] });
    const out = await directMotion(PLATE, r.fn);
    expect(out.kind, JSON.stringify(moves)).toBe("declined");
    expect(clipAfter(emptyClip(), out).motion).toBe("");
  }
});

test("case 2d: the model's own decline is carried verbatim", async () => {
  const r = fakeRecognize(read([{ name: "logo mark", where: "centre", separable: true }]), {
    prompt: "",
    moves: [],
    holds_still: ["logo mark"],
    decline: "the logo is the whole frame; moving it moves the picture",
  });
  const out = await directMotion(PLATE, r.fn);
  expect(out.kind).toBe("declined");
  if (out.kind === "declined") expect(out.reason).toBe("the logo is the whole frame; moving it moves the picture");
});

test("proposed: named elements get verbs, the basis travels with the line, and the proposal pass is handed the reading", async () => {
  const r = fakeRecognize(
    read([
      { name: "tallest bar", where: "centre right", separable: true },
      { name: "ground line", where: "bottom", separable: false },
    ]),
    {
      prompt: "A flat vector bar chart on cream paper. The tallest bar rises a little. The ground line and the camera hold still.",
      moves: [{ element: "Tallest bar", verb: "rises" }],
      holds_still: ["ground line", "camera"],
    },
  );
  const out: MotionOutcome = await directMotion(PLATE, r.fn, {}, 1_800_000_000_000);

  expect(out.kind).toBe("proposed");
  if (out.kind !== "proposed") return;
  expect(out.motion).toContain("tallest bar rises");
  expect(out.basis.moves).toEqual([{ element: "tallest bar", verb: "rises" }]);
  expect(out.basis.elements).toEqual(["tallest bar", "ground line"]);
  expect(out.basis.scene).toBe("a flat vector chart on cream paper");
  expect(out.basis.provider).toBe("ollama");
  expect(out.basis.model).toBe("qwen3.8:27b");
  expect(out.at).toBe(1_800_000_000_000);

  expect(r.asked).toHaveLength(2);
  expect(r.asked[0].schema, "the read pass must ask for structured output").toBeTruthy();
  expect(r.asked[1].instruction).toContain("tallest bar");
  expect(r.asked[1].instruction).toContain("ground line");

  // Accepting a proposal authors the clip; it does not claim a render.
  const clip = clipAfter(emptyClip(), out);
  expect(clip.motion).toBe(out.motion);
  expect(clip.status).toBe("not-started");
});

test("accept writes one frame's clip.motion, trims it, and refuses an empty line", () => {
  const frames = [frame("f1"), frame("f2", "the circle drifts upward")];
  const next = withAcceptedMotion(frames, "f1", "  the bar rises  ");
  expect(next[0].clip.motion).toBe("the bar rises");
  expect(next[0].clip.status).toBe("not-started");
  expect(next[1]).toBe(frames[1]);
  expect(withAcceptedMotion(frames, "f1", "   ")).toBe(frames);
  expect(withAcceptedMotion(frames, "nope", "x")).toBe(frames);
});

test("accept lands on the units too: the v2 record's units are what Frames reads back", () => {
  // The bug this holds: accept wrote the `frames` shadow only, Frames rebuilt
  // its frames from `units` on the next open, and the accepted line was gone.
  const stored = { v: 2, frames: [frame("f1"), frame("f2")], units: [frame("f1"), frame("f2")] };
  const r = acceptIntoFramesRecord(stored, "f1", "the bar rises");
  if (!("put" in r)) throw new Error(`expected a write, got ${JSON.stringify(r)}`);
  const put = r.put as typeof stored;
  expect(put.frames[0].clip.motion).toBe("the bar rises");
  expect(put.units[0].clip.motion).toBe("the bar rises");
  expect(put.units[1]).toBe(stored.units[1]);
  expect(put.v).toBe(2);

  // v1: no units, written as it was
  const v1 = acceptIntoFramesRecord({ frames: [frame("f1")] }, "f1", "x");
  expect("put" in v1 && "units" in v1.put).toBe(false);
  expect(acceptIntoFramesRecord(null, "f1", "x")).toEqual({ skip: "no frames record" });
  expect(acceptIntoFramesRecord(stored, "f1", "   ")).toEqual({ skip: "unchanged" });
});

test("the step's own word: nothing directed -> nothing to report; anything authored or decided -> working", () => {
  expect(motionReport([], {})).toBeNull();
  expect(motionReport([frame("f1")], {})).toBeNull();
  expect(motionReport([frame("f1", "the bar rises")], {})).toBe("working");
  expect(
    motionReport([frame("f1")], { f1: { kind: "declined", reason: "flat", basis: { scene: "", elements: [] }, at: 1 } }),
  ).toBe("working");
});

test("route: /api/motion/direct is gated, and an authed call with no plate is a 400 before any read", async () => {
  __resetRateLimit();
  process.env[ACCESS_SECRET_VAR] = "probe-secret-motion";
  const mk = (bearer?: string, body: unknown = {}) =>
    new Request("http://localhost/api/motion/direct", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `10.9.${Math.floor(Math.random() * 200)}.1`,
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(body),
    });
  expect((await directPOST(mk())).status).toBe(401);
  const bad = await directPOST(mk("probe-secret-motion"));
  expect(bad.status).toBe(400);
  expect((await bad.json()).code).toBe("bad-request");
});
