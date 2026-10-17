// THE AUDIO DESK'S ENGINE REGISTRY - which engines this studio can reach from /audio, by what
// transport, with which operations, and why the rest are withheld. Pure: no React, no fetch, no
// environment except the capability flags a caller passes in.
//
// Moved from v1 app/playground/engines.ts (which dies with the playground in wave C). Its seam is
// the reason it exists and is kept whole: a view never asks "is this Suno?", it asks
// `can(engine, op)`, so an engine gaining an operation flips a row instead of adding an `if`
// to every view - and a declared engine with nothing installed never renders a fake take.
//
// UPGRADED - the rows say what is true on the desk now, not in the v1 lab:
//   suno        v1 "manual" (paste a prompt, drop the file back). Suno automation landed: a seed
//               is SENT as Suno's form through a receipt and runs as a box.chrome job
//               (lib/producers/suno.ts), so the row flipped to transport "browser" and gained
//               `compose` - exactly the flip v1's header predicted. The round trip stays: a
//               remaster or edit is still done by hand in Suno's studio and its file returned.
//   elevenlabs  v1 "api" with live compose/plan/section-edit/sfx through /api/music/*. Those
//               routes are the v1 lab's and nothing on the desk launches them: a free ElevenLabs
//               seed has no producer, and a press that bills with no receipt is the defect the
//               receipt removed (SeedComposer's header). So every render op is WITHHELD with
//               that reason - or with the deployment's own reason when the capability is off -
//               and the dialect stays copyable.
//   local       unchanged: declared, not installed, with what it would take.
import { ABSENCE_REASON, absenceReason, type Capabilities, type DeploymentFacts } from "../capabilities.ts";

export type EngineId = "elevenlabs" | "suno" | "local";
/** How the desk reaches an engine: a vendor API, a browser job on the render box, a person's hands, or nothing. */
export type Transport = "api" | "browser" | "manual" | "none";

export type Op =
  /** one brief, one render */
  | "compose"
  /** draft a section plan, then render it */
  | "plan"
  /** regenerate chosen sections of a stored song */
  | "section-edit"
  /** a sound effect from text */
  | "sfx"
  /** the prompt in the engine's dialect, for a person to take elsewhere */
  | "prompt-copy"
  /** a hand-made remaster or edit filed back as the stack's next version */
  | "file-return";

export const RENDER_OPS: readonly Op[] = ["compose", "plan", "section-edit", "sfx"];

/** A model a local lane could run, as far as this repo has looked: a candidate, not an integration. */
export type LocalCandidate = { readonly name: string; readonly licence: string; readonly note: string };

export type EngineDef = {
  readonly id: EngineId;
  readonly name: string;
  readonly transport: Transport;
  /** Operations the desk can perform now. */
  readonly ops: readonly Op[];
  /** Operations the engine has that the desk withholds, each with its reason verbatim. */
  readonly withheld: readonly { readonly op: Op; readonly reason: string }[];
  /** For the declared lane: what it would take to make it real. */
  readonly needs?: readonly string[];
  readonly candidates?: readonly LocalCandidate[];
};

/** Why the desk launches no ElevenLabs render while the capability is on. */
export const NO_DESK_PRODUCER = "no desk producer: renders run as Score cues or sound.mts generate";

export function engineRegistry(caps: Pick<Capabilities, "musicSectionEdit" | "musicSfx">, facts?: DeploymentFacts): readonly EngineDef[] {
  const why = (cap: "musicSectionEdit" | "musicSfx"): string => (facts === undefined ? ABSENCE_REASON[cap] : absenceReason(cap, facts));
  // compose / plan / section-edit share /api/music/compose and its stored-song posture, which the
  // musicSectionEdit flag governs (lib/capabilities.ts); sfx has its own flag.
  const el = (op: Op): { op: Op; reason: string } => {
    const cap = op === "sfx" ? "musicSfx" : "musicSectionEdit";
    return { op, reason: caps[cap] ? NO_DESK_PRODUCER : why(cap) };
  };
  return [
    { id: "suno", name: "Suno", transport: "browser", ops: ["compose", "prompt-copy", "file-return"], withheld: [] },
    // Effects run on the desk as the `sfx` producer's batch (L66) whenever the capability is on.
    { id: "elevenlabs", name: "ElevenLabs", transport: "api", ops: caps.musicSfx ? ["prompt-copy", "sfx"] : ["prompt-copy"], withheld: RENDER_OPS.filter((op) => !(op === "sfx" && caps.musicSfx)).map(el) },
    {
      id: "local",
      name: "Local",
      transport: "none",
      ops: [],
      withheld: [],
      // In the order it would be built; each is work this repo does not have yet.
      needs: ["a GPU runner on this machine", "a music adapter and its producer", "a licence decision per model"],
      candidates: [
        { name: "MusicGen", licence: "weights CC-BY-NC 4.0", note: "non-commercial only" },
        { name: "Stable Audio Open", licence: "Stability community licence", note: "short clips, effects" },
        { name: "ACE-Step", licence: "Apache-2.0", note: "full songs, lyrics" },
      ],
    },
  ];
}

export const can = (e: EngineDef | undefined, op: Op): boolean => e !== undefined && e.ops.includes(op);

export const engineById = (reg: readonly EngineDef[], id: EngineId): EngineDef | undefined => reg.find((e) => e.id === id);

/** The op that makes a take of a kind: a song is composed, an effect is an sfx render. */
export const makeOp = (kind: "music" | "sfx"): Op => (kind === "sfx" ? "sfx" : "compose");

/** Engines the desk can make a kind with now - empty when none can, which the desk draws as such. */
export const makersOf = (reg: readonly EngineDef[], kind: "music" | "sfx"): readonly EngineDef[] => reg.filter((e) => can(e, makeOp(kind)));

export type EngineState = "live" | "round-trip" | "copy-only" | "off" | "not-installed";

/** An engine's state, DERIVED from its row (v1 stored it beside the ops, and the two could disagree). */
export function engineState(e: EngineDef): EngineState {
  if (e.ops.some((op) => RENDER_OPS.includes(op))) return "live";
  if (e.ops.includes("file-return")) return "round-trip";
  if (e.ops.includes("prompt-copy")) return "copy-only";
  return e.transport === "none" ? "not-installed" : "off";
}
