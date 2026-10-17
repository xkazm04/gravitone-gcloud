// WHICH TEXT ENGINE A HUNT ASKS (Phase 6, L65). Production asks the router (lib/text/router.ts
// `reason`: the "sound-hunt" and "sound-lesson" turns, the operator's seat first). A test, a dev
// server and a cx capture must never spend that seat, so `SOUND_HUNT_ENGINE=stub` swaps in a
// canned engine that answers the same schema from the idea alone - the same seam v1's draftHunt
// took as a parameter (`ReasonFn`), now chosen in one place instead of by every caller. The
// stub's provenance names itself in its model (`stub-canned`), and the map carries it as `draftedBy`.
import { reason as routerReason } from "../text/router.ts";
import type { TextProvenance, TextRequest, TextResult } from "../text/types.ts";
import type { ReasonFn } from "./hunt.ts";

export const STUB_MODEL = "stub-canned (no seat asked)";

/** The provenance a stub answer carries: the transport the seat would have used, and a model
 *  name that says no seat was asked. The router's provider ids are a closed set; the model is
 *  where the stub names itself. */
const prov = (turn: TextRequest["turn"], promptChars: number): TextProvenance => ({
  provider: "claude-cli",
  model: STUB_MODEL,
  transport: "local-subprocess",
  rung: "preferred",
  turn,
  schemaEnforcement: "prompted",
  durationMs: 0,
  costBasis: "unpriced",
  promptChars,
});

const idea = (prompt: string): string => /"""\s*([\s\S]*?)\s*"""/.exec(prompt)?.[1]?.slice(0, 80) ?? "the idea";

/** A canned map: two axes of two leaves (one by hand on Suno) for music, envelope variants for sfx. */
function stubMap(prompt: string): unknown {
  const sfx = /sound effect/i.test(prompt.split("\n").slice(0, 6).join(" "));
  const what = idea(prompt);
  if (sfx)
    return {
      branches: [
        { axis: "technique", label: "How it is briefed", rationale: "The envelope against a plain sentence.", leaves: [
          { label: "Single sentence", rationale: "The plain brief.", provider: "elevenlabs", technique: ["single-sentence"], prompt: `${what}, dry, close`, durationS: 1.5, loop: false, terms: { mood: ["bright"], sfxCategory: "ui" } },
          { label: "Envelope first", rationale: "Attack, body, tail before the material.", provider: "elevenlabs", technique: ["envelope-first-briefing"], prompt: `event: ${what}; attack: soft; body: short; tail: dry; loop: no`, durationS: 1.2, loop: false, terms: { mood: ["bright"], sfxCategory: "ui" } },
        ] },
        { axis: "weight", label: "How heavy", rationale: "The same event at two weights.", leaves: [
          { label: "Light", rationale: "Almost no low end.", provider: "elevenlabs", technique: ["single-sentence"], prompt: `${what}, light and airy`, durationS: 1, loop: false, terms: { mood: ["light"], sfxCategory: "ui" } },
          { label: "Heavy", rationale: "A soft low thump under it.", provider: "elevenlabs", technique: ["layered-element-assembly"], prompt: `${what}, with a soft low thump`, durationS: 1.5, loop: false, terms: { mood: ["solid"], sfxCategory: "ui" } },
        ] },
      ],
    };
  return {
    branches: [
      { axis: "tempo", label: "How fast", rationale: "Slowness against drive.", leaves: [
        { label: "Slow, 72 BPM", rationale: "Weight from slowness.", provider: "elevenlabs", technique: ["duration-and-tempo-locking"], prompt: `${what}, locked at 72 BPM in D minor`, durationS: 30, tempoBpm: 72, key: "D minor", terms: { genre: ["underscore"], mood: ["tense"], instrument: ["piano"] } },
        { label: "Driving, 110 BPM", rationale: "Forward motion.", provider: "elevenlabs", technique: ["duration-and-tempo-locking"], prompt: `${what}, locked at 110 BPM in D minor`, durationS: 30, tempoBpm: 110, key: "D minor", terms: { genre: ["underscore"], mood: ["hopeful"], instrument: ["piano"] } },
      ] },
      { axis: "technique", label: "How it is briefed", rationale: "A plan against a sentence.", leaves: [
        { label: "Section plan", rationale: "Name the sections and their seconds.", provider: "elevenlabs", technique: ["section-plan-as-the-brief"], prompt: `Intro 8s: ${what} / Build 14s: add strings / Tail 8s: resolve`, durationS: 30, terms: { genre: ["underscore"], mood: ["tense"], instrument: ["strings"] } },
        { label: "Suno style line", rationale: "Suno's dialect for the same brief.", provider: "suno", technique: ["tag-list"], prompt: `cinematic underscore, tense, hopeful, piano, strings [Intro] [Build] [Outro]`, durationS: 60, terms: { genre: ["underscore"], mood: ["tense"], instrument: ["piano"] } },
      ] },
    ],
  };
}

export const stubReason: ReasonFn = async (req: TextRequest): Promise<TextResult> => {
  const json = req.turn === "sound-lesson" ? { claim: "When the bed must sit under speech, lock the tempo in the brief, because the unlocked takes drifted in one hunt.", technique: ["duration-and-tempo-locking"], provider: "elevenlabs" } : stubMap(req.prompt);
  return { text: JSON.stringify(json), json, provenance: prov(req.turn, req.prompt.length) };
};

/** The engine a hunt asks: the stub under `SOUND_HUNT_ENGINE=stub`, else the router. */
export function huntReason(env: Readonly<Record<string, string | undefined>> = process.env): ReasonFn {
  return env["SOUND_HUNT_ENGINE"] === "stub" ? stubReason : routerReason;
}
