// THE AUDIO DESK'S ENGINE REGISTRY - which engines this studio can reach from /audio, by what
// transport, with which operations, and why the rest are withheld. Pure: no React, no fetch, no
// environment except the capability flags a caller passes in.

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

export function engineRegistry(
  caps: Pick<Capabilities, "musicSectionEdit" | "musicSfx"> & { readonly localRender?: boolean },
  facts?: DeploymentFacts,
): readonly EngineDef[] {
  const why = (cap: "musicSectionEdit" | "musicSfx"): string => (facts === undefined ? ABSENCE_REASON[cap] : absenceReason(cap, facts));
  const el = (op: Op): { op: Op; reason: string } => {
    const cap = op === "sfx" ? "musicSfx" : "musicSectionEdit";
    return { op, reason: caps[cap] ? NO_DESK_PRODUCER : why(cap) };
  };
  const localActive = caps.localRender === true || facts?.localBinaries === true;
  return [
    { id: "suno", name: "Suno", transport: "browser", ops: ["compose", "prompt-copy", "file-return"], withheld: [] },
    { id: "elevenlabs", name: "ElevenLabs", transport: "api", ops: caps.musicSfx ? ["prompt-copy", "sfx"] : ["prompt-copy"], withheld: RENDER_OPS.filter((op) => !(op === "sfx" && caps.musicSfx)).map(el) },
    localActive
      ? {
          id: "local",
          name: "Local",
          transport: "api",
          ops: ["compose", "section-edit"],
          withheld: [],
          candidates: [
            { name: "Vital VST3 + Local Sample Kits", licence: "Vital Audio EULA + Local DAW packs", note: "deterministic 4-stem score engine ($0)" },
          ],
        }
      : {
          id: "local",
          name: "Local",
          transport: "none",
          ops: [],
          withheld: [],
          needs: ["a GPU runner on this machine", "a music adapter and its producer", "a sidecar binary posture"],
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
