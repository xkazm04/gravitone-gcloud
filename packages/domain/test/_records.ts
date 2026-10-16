// Shared helpers and small real fixtures for the record tests. Fixtures are
// taken from the prototype's data (docs/next/prototype/app/model.js,
// studio.js, fixtures.js) and v1's catalogue (pipeline/foundry/styles.json).
import { expect } from "vitest";
import type { z } from "zod";

import { parseAt, type Parsed } from "../src/door.ts";

export function accept<S extends z.ZodType>(schema: S, input: unknown): Parsed<z.output<S>> {
  const r = parseAt("test", schema, input);
  if (!r.ok) throw new Error(`expected the door to accept: ${r.error.message}`);
  return r.value;
}

/** The door refuses, and its message names `fragment` (a path or a phrase). */
export function refuse(schema: z.ZodType, input: unknown, fragment: string): void {
  const r = parseAt("test", schema, input);
  expect(r.ok, `expected a refusal mentioning "${fragment}"`).toBe(false);
  if (!r.ok) {
    expect(r.error.code).toBe("invalid");
    expect(r.error.message).toContain(fragment);
  }
}

export const AT = "2026-10-14T07:02:00Z";
export const SHA = "9f2c6a1e0b7d4c3f8a5e2d1c0b9a8f7e6d5c4b3a29180f7e6d5c4b3a2918a0b1";
export const BLOB = { sha256: SHA, bytes: 482113, mime: "image/jpeg" };
export const HOLDER = { bootId: "b-mgq3k2-1a2b3c4d", pid: 4412, host: "render-box" };
export const PRICED = { seconds: 96, usd: 0 };
export const UNPRICED = { seconds: 240, usd: null, unpricedReason: "Suno credits are not priced per prompt" };

/** Glass Harbor — trailer (studio.js), as the records store holds it: a head and its plan rows. */
export function glassHarborTrailer() {
  const w = (id: string, kind: string, option: string, units: number, after: string[]) => ({ id, kind, option, units, after });
  const g = (judges: string, verdict: string) => ({ id: `gate:${judges}`, kind: "gate", judges, verdict, after: [judges] });
  return {
    project: {
      id: "seed-glass-harbor-trailer",
      title: "Glass Harbor — trailer",
      recipe: "film/trailer",
      styleId: "painted-3d",
      runtimeS: 120,
      rev: 3,
      createdAt: "2026-10-13T16:30:00Z",
      launchedAt: "2026-10-13T16:40:00Z",
    },
    parts: [
      w("research", "research", "research/claude-cli/claude-opus-5", 1, []),
      w("script", "script", "script/claude-cli/claude-opus-5", 1, ["research"]),
      w("frames", "frames", "frames/comfy/flux-2-dev-fp8", 24, ["script"]),
      g("frames", "matrix-cull"),
      w("motion", "motion", "motion/wan/wan2.2-ti2v-5B", 10, ["gate:frames"]),
      w("score", "score", "score/suno/v6", 2, ["script"]),
      g("score", "pick"),
      w("cut", "cut", "cut/ffmpeg/ffmpeg-compositor", 1, ["motion", "gate:score"]),
      g("cut", "packet-review"),
      { id: "slot", kind: "slot", after: ["gate:cut"] },
    ],
  };
}

export function forgeCandidate(id: string, row: string) {
  return {
    id,
    jobId: "job_sweep01",
    media: BLOB,
    row,
    grades: [
      {
        field: "dojo_judge",
        value: 0.81,
        series: "gemini-3.7-flash@4c1e",
        calibration: { status: "calibrated", auc: 0.69, ci: [0.56, 0.8], nKeep: 41, nReject: 46 },
      },
      {
        field: "craft",
        value: 8,
        series: "qwen3.8:27b@unstamped",
        calibration: { status: "inverted", auc: 0.29, ci: [0.19, 0.4], nKeep: 41, nReject: 46 },
      },
    ],
  };
}
