// PERFORM A REPLICA — one generate-and-critique round for one (style, source)
// pair: draw the image from words, read it back, score it against the style,
// and adopt the best-scoring recipe. The loop around this round is in
// units.ts (next, replicaSettled); this file performs one round of it.

import type { EngineIO } from "./engine";
import { tripped } from "./breaker";
import { log } from "./journal";
import { bestRound, hash, scoreOf } from "./helpers";
import { isReadback, msg, setStage } from "./performCommon";
import { critiqueInstruction, replicaPrompt } from "./prompts";
import { CRITIQUE_SCHEMA, styleScore, usableFix } from "./vocabulary";
import { book, isOverBudget, stopFor } from "./spend";
import type { Critique, ExtractManifest, ReplicaRound } from "./types";
import { unitLabel, type Unit } from "./units";

export async function performReplica(m: ExtractManifest, io: EngineIO, unit: Extract<Unit, { kind: "replica" }>): Promise<void> {
  setStage(m, "replicating");
  const st = m.styles.find((x) => x.id === unit.style)!;
  const src = m.sources.find((x) => x.id === unit.source)!;
  let rep = st.replicas.find((r) => r.source === unit.source);
  if (!rep) {
    rep = { source: unit.source, rounds: [] };
    st.replicas.push(rep);
  }
  // The recipe this round tries: the previous round's fix when there was
  // one, else the recipe in force.
  const prev = rep.rounds[rep.rounds.length - 1];
  const recipe = (prev && usableFix(prev.critique, prev.recipe)) || st.recipe;
  const prompt = replicaPrompt(recipe, src.readback!.depiction);
  const file = `styles/${st.id}/replica-${src.id}-r${unit.round}.jpg`;
  const round: ReplicaRound = {
    n: unit.round,
    file: null,
    recipe,
    prompt,
    critique: null,
    score: null,
    per_field: {},
    generator: null,
    vision: null,
    error: null,
  };
  rep.rounds.push(round);
  const seed = m.options.seed + hash(`${st.id}/${src.id}`) * 10 + unit.round;
  try {
    const g = await io.generate(prompt, st.negative, src.aspect, seed);
    book(m, io, "replica", "generate", g);
    await io.writeImage(file, g.value);
    round.file = file;
    round.generator = g.model;
    m.engines.generator = g.model;
  } catch (e) {
    if (isOverBudget(e)) {
      // Nothing was drawn and nothing billed: the round is withdrawn, not
      // left behind as an errored one for a retry to prune.
      rep.rounds.pop();
      if (!rep.rounds.length) st.replicas.splice(st.replicas.indexOf(rep), 1);
      stopFor(m, io, "period-ceiling", `The spend window refused ${unitLabel(unit)}: ${msg(e)}`);
      return;
    }
    round.error = `generate: ${msg(e)}`;
    log(m, io, `${unitLabel(unit)} — ${round.error}`);
    tripped(m, io, round.error);
    return;
  }
  try {
    const img = await io.readImage(file);
    const c = await io.recognize(img, critiqueInstruction(st, recipe), CRITIQUE_SCHEMA);
    book(m, io, "replica", "recognize", c);
    if (!isReadback(c.value)) throw new Error("the critique did not carry every observable");
    round.critique = c.value as Critique;
    round.vision = c.model;
    const sc = styleScore(st.observables, round.critique);
    round.score = sc.score;
    round.per_field = sc.per_field;
    if (!st.recipe_history.includes(recipe)) st.recipe_history.push(recipe);
    // Adopt the recipe that scored best across every round of every
    // replica of this style — the recipe in force is a measurement.
    const best = bestRound(st);
    if (best && best.recipe !== st.recipe && (best.score ?? 0) > (scoreOf(st, st.recipe) ?? -1)) st.recipe = best.recipe;
    log(m, io, `${unitLabel(unit)}: ${Math.round((round.score ?? 0) * 100)}%${round.critique.has_text ? " TEXT" : ""}${round.critique.critique ? ` — ${round.critique.critique.slice(0, 90)}` : ""}`);
    m.fail_streak = 0;
  } catch (e) {
    round.error = `critique: ${msg(e)}`;
    log(m, io, `${unitLabel(unit)} — ${round.error}`);
    // The pixels exist and are kept; a refused critique stops, not trips.
    if (isOverBudget(e)) stopFor(m, io, "period-ceiling", `The spend window refused the critique of ${unitLabel(unit)}: ${msg(e)}`);
    else tripped(m, io, round.error);
  }
}
