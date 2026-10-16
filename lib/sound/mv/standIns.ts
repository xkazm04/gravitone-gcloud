// THE MUSIC-VIDEO DRY STAND-INS - what a DRY job continues on in place of the
// two paid calls it would have made (kernel dryrun.ts `paid` intent `stand`).
// Replaces v1's `__setMvEngines` as the way a music-video job runs without
// money: the job's mode decides, not a module-level override a probe had to
// remember to clear. Free local work (fetch, analyse, render) still runs for
// real in a dry job - it costs electricity, not credits - so a dry run proves
// the whole track end to end over a placeholder picture and canned words.
//
// Each answer is shaped to pass the same parsers a real one does
// (./treatment.ts parseTreatment / writeMotion, ./metadata.ts fitMetadata), so
// a dry job fails exactly where a live one would for any reason but the vendor.

import type { TextRequest, TextResult } from "@/lib/text/types";

import { TREATMENT_TURN } from "./treatment";
import type { StillImage } from "./steps";

/** A 1x1 PNG: a valid picture that is obviously not a still anyone bought. */
const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export function standStill(): StillImage {
  return { bytes: new Uint8Array(Buffer.from(PIXEL, "base64")), mime: "image/png" };
}

const MOTION = { particleDensity: 0.5, particleHue: 210, pulseStrength: 0.5 };

function standJson(req: TextRequest): unknown {
  const required = (req.schema as { required?: unknown } | undefined)?.required;
  if (req.turn !== TREATMENT_TURN) return { title: "dry run", description: "A dry run: no model was asked for these words.", tags: ["dry run"] };
  if (Array.isArray(required) && required.length === 1 && required[0] === "motion") return { motion: MOTION };
  return { prompt: "dry run placeholder still", motion: MOTION, rationale: "dry run: no model was asked" };
}

export function standText(req: TextRequest): TextResult {
  const json = standJson(req);
  return {
    text: JSON.stringify(json),
    json,
    provenance: {
      provider: "claude-cli",
      model: "dry-run stand-in",
      transport: "local-subprocess",
      rung: "preferred",
      turn: req.turn,
      schemaEnforcement: req.schema === undefined ? "none" : "native",
      durationMs: 0,
      costBasis: "unpriced",
      promptChars: req.prompt.length,
    },
  };
}
