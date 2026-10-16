// PERFORM A TRANSFER — one style applied to one neutral scene: generate the
// image from the recipe and the scene brief, then read it back and score it.
// Scenes are fixed in prompts.ts (TRANSFER_SCENES); a transfer carries no
// reference image either.

import type { EngineIO } from "./engine";
import { tripped } from "./breaker";
import { log } from "./journal";
import { hash } from "./helpers";
import { isReadback, logOffVocabulary, msg, passDeath, setStage } from "./performCommon";
import { TRANSFER_SCENES, readbackInstruction, transferPrompt } from "./prompts";
import { READBACK_SCHEMA, styleScore } from "./vocabulary";
import { book, isOverBudget, stopFor } from "./spend";
import type { ExtractManifest, Transfer } from "./types";
import { unitLabel, type Unit } from "./units";
import { VOCAB_VERSION } from "@/lib/vocab/cinematography";

export async function performTransfer(m: ExtractManifest, io: EngineIO, unit: Extract<Unit, { kind: "transfer" }>): Promise<void> {
  setStage(m, "transferring");
  const st = m.styles.find((x) => x.id === unit.style)!;
  const brief = TRANSFER_SCENES[unit.scene];
  const prompt = transferPrompt(st.recipe, brief);
  const file = `styles/${st.id}/transfer-${unit.scene + 1}.jpg`;
  const t: Transfer = { scene: unit.scene, brief, file: null, prompt, readback: null, score: null, per_field: {}, generator: null, vision: null, error: null };
  st.transfers.push(t);
  const seed = m.options.seed + hash(`${st.id}/transfer`) * 10 + unit.scene;
  try {
    const g = await io.generate(prompt, st.negative, "16:9", seed);
    book(m, io, "transfer", "generate", g);
    await io.writeImage(file, g.value);
    t.file = file;
    t.generator = g.model;
  } catch (e) {
    passDeath(e);
    if (isOverBudget(e)) {
      st.transfers.pop();
      stopFor(m, io, "period-ceiling", `The spend window refused ${unitLabel(unit)}: ${msg(e)}`);
      return;
    }
    t.error = `generate: ${msg(e)}`;
    log(m, io, `${unitLabel(unit)} — ${t.error}`);
    tripped(m, io, t.error);
    return;
  }
  try {
    const img = await io.readImage(file);
    const r = await io.recognize(img, readbackInstruction(), READBACK_SCHEMA);
    book(m, io, "transfer", "recognize", r);
    if (!isReadback(r.value)) throw new Error("the readback did not carry every observable");
    t.readback = { ...r.value, vocabVersion: VOCAB_VERSION };
    t.vision = r.model;
    const sc = styleScore(st.observables, t.readback);
    t.score = sc.score;
    t.per_field = sc.per_field;
    logOffVocabulary(m, io, unitLabel(unit), t.readback);
    log(m, io, `${unitLabel(unit)}: ${Math.round((t.score ?? 0) * 100)}%${t.readback.has_text ? " TEXT" : ""}`);
    m.fail_streak = 0;
  } catch (e) {
    passDeath(e);
    t.error = `readback: ${msg(e)}`;
    log(m, io, `${unitLabel(unit)} — ${t.error}`);
    if (isOverBudget(e)) stopFor(m, io, "period-ceiling", `The spend window refused the readback of ${unitLabel(unit)}: ${msg(e)}`);
    else tripped(m, io, t.error);
  }
}
