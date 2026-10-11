// PERFORM A READ — one source's readback: the image is read and the vision model
// returns the observables for it. A refused readback is recorded on the source;
// an over-budget refusal stops the run for money instead.

import type { EngineIO } from "./engine";
import { tripped } from "./breaker";
import { log } from "./journal";
import { isReadback, logOffVocabulary, msg, setStage } from "./performCommon";
import { readbackInstruction, singletonInstruction } from "./prompts";
import { READBACK_SCHEMA, SINGLETON_SCHEMA } from "./vocabulary";
import { book, isOverBudget, stopFor } from "./spend";
import type { ExtractManifest } from "./types";
import { unitLabel, type Unit } from "./units";

export async function performRead(m: ExtractManifest, io: EngineIO, unit: Extract<Unit, { kind: "read" }>): Promise<void> {
  setStage(m, "reading");
  const s = m.sources.find((x) => x.id === unit.source)!;
  const singleton = m.options.grouping === "none";
  try {
    const img = await io.readImage(s.file);
    const r = await io.recognize(img, singleton ? singletonInstruction() : readbackInstruction(), singleton ? SINGLETON_SCHEMA : READBACK_SCHEMA);
    book(m, io, "read", "recognize", r);
    if (!isReadback(r.value)) throw new Error("the readback did not carry every observable");
    s.readback = { ...r.value, dominant_colours: Array.isArray(r.value.dominant_colours) ? r.value.dominant_colours.slice(0, 5).map(String) : [] };
    m.engines.vision = r.model;
    logOffVocabulary(m, io, `read ${s.id}`, s.readback);
    log(m, io, `read ${s.id} (${s.name}): ${s.readback.render_mode}, ${s.readback.palette_strategy}`);
  } catch (e) {
    if (isOverBudget(e)) {
      stopFor(m, io, "period-ceiling", `The spend window refused ${unitLabel(unit)}: ${msg(e)}`);
      return;
    }
    s.error = msg(e);
    log(m, io, `read ${s.id} failed: ${s.error}`);
    tripped(m, io, s.error);
    return;
  }
  m.fail_streak = 0;
}
