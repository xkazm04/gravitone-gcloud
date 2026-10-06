// THE SOUND LAB'S ENGINE REGISTRY — which engines this studio can reach, by
// what transport, and with which operations. Pure: no React, no fetch, no
// environment except the capability flags a caller passes in.
//
// Three engines, three honest states, and the transport is the seam:
//
//   elevenlabs   transport "api"     — the live engine. Every operation goes
//                                      through the gated /api/music/* routes
//                                      (lib/musicClient.ts); this file knows
//                                      none of their wire shapes.
//   suno         transport "manual"  — no API this repo is entitled to call.
//                                      The lab composes the prompt (style line,
//                                      exclude line, section tags), a person
//                                      pastes it into Suno and drops the file
//                                      back. Designed as a first-class lane, not
//                                      a workaround.
//   local        transport "none"    — DECLARED, not installed. No runner, no
//                                      route, no output. `needs` says what it
//                                      would take, and nothing in the lab ever
//                                      renders a fake take for it.
//
// THE SEAM. A view never asks "is this Suno?" — it asks `can(engine, op)` and
// reads `transport`. When Suno automation lands (a separate research task is
// checking feasibility, 2026-10-05) its row flips to `transport: "api"` and
// gains "compose", and a local runner gains "compose" the same way; the lab's
// views render whatever the row says without being edited. That is the whole
// reason this is a table and not three `if`s.

import { absenceReason, ABSENCE_REASON, type Capabilities, type DeploymentFacts } from "@/lib/capabilities";

export type EngineId = "elevenlabs" | "suno" | "local";
export type Transport = "api" | "manual" | "none";

/** What an engine can be asked to do from the lab. */
export type Op =
  /** one prompt, one render */
  | "compose"
  /** draft a section plan (free), then render it */
  | "plan"
  /** regenerate chosen sections of a stored song, keeping the rest by reference */
  | "section-edit"
  /** a sound effect from text */
  | "sfx"
  /** compose a prompt for a person to paste into the vendor */
  | "prompt-copy"
  /** file a vendor's returned audio as a take */
  | "file-return";

export type EngineStatus =
  | { state: "live" }
  | { state: "manual" }
  /** Reachable in principle, switched off in this deployment. */
  | { state: "off"; reason: string }
  /** Declared, nothing installed. */
  | { state: "not-installed" };

/** A model a local lane could run, as far as this repo has looked. A
 *  candidate, not an integration — the licence line is the reason a
 *  candidate can be ruled out before anyone downloads a weight. */
export interface LocalCandidate {
  name: string;
  licence: string;
  note: string;
}

export interface EngineDef {
  id: EngineId;
  name: string;
  transport: Transport;
  status: EngineStatus;
  /** Operations this deployment can perform now. */
  ops: Op[];
  /** Operations the engine has but this deployment withholds, each with the
   *  verbatim reason (lib/capabilities.ts#ABSENCE_REASON). Kept apart from
   *  `ops` so a withheld panel can keep its place and say why. */
  withheld: { op: Op; reason: string }[];
  /** For the declared lane: what it would take to make it real. */
  needs?: string[];
  candidates?: LocalCandidate[];
}

/** The registry, for one deployment's capability flags. `facts` (the server's,
 *  lib/useCapabilities.ts) lets a withheld op name what is missing - the key on
 *  a fresh clone, the hosted plan elsewhere; without it the flag's reason. */
export function engineRegistry(
  caps: Pick<Capabilities, "musicSectionEdit" | "musicSfx">,
  facts?: DeploymentFacts,
): EngineDef[] {
  const why = (cap: "musicSectionEdit" | "musicSfx") => (facts ? absenceReason(cap, facts) : ABSENCE_REASON[cap]);
  // compose / plan / section-edit stand or fall together: they share
  // /api/music/compose and its stored-song posture, which is what the
  // musicSectionEdit flag governs (lib/capabilities.ts). The Score phase's cue
  // render is musicGenerate, a different route, and is not the lab's business.
  const elOps: Op[] = [];
  const elWithheld: EngineDef["withheld"] = [];
  for (const op of ["compose", "plan", "section-edit"] as const) {
    if (caps.musicSectionEdit) elOps.push(op);
    else elWithheld.push({ op, reason: why("musicSectionEdit") });
  }
  if (caps.musicSfx) elOps.push("sfx");
  else elWithheld.push({ op: "sfx", reason: why("musicSfx") });

  return [
    {
      id: "elevenlabs",
      name: "ElevenLabs",
      transport: "api",
      status: elOps.length ? { state: "live" } : { state: "off", reason: why("musicSectionEdit") },
      ops: elOps,
      withheld: elWithheld,
    },
    {
      id: "suno",
      name: "Suno",
      transport: "manual",
      status: { state: "manual" },
      ops: ["prompt-copy", "file-return"],
      withheld: [],
    },
    {
      id: "local",
      name: "Local",
      transport: "none",
      status: { state: "not-installed" },
      ops: [],
      withheld: [],
      // What a local lane would need, in the order it would be built. Each is
      // a real piece of work this repo does not have yet — there is no music
      // runner, no lib/music adapter for one, and no route.
      needs: [
        "a GPU runner on this machine",
        "a lib/music adapter + /api/music route",
        "a licence decision per model",
      ],
      candidates: [
        { name: "MusicGen", licence: "weights CC-BY-NC 4.0", note: "non-commercial only" },
        { name: "Stable Audio Open", licence: "Stability community licence", note: "short clips, effects" },
        { name: "ACE-Step", licence: "Apache-2.0", note: "full songs, lyrics" },
      ],
    },
  ];
}

export const can = (e: EngineDef | undefined, op: Op): boolean => !!e && e.ops.includes(op);

export const engineById = (reg: readonly EngineDef[], id: EngineId) => reg.find((e) => e.id === id);

/** The word an engine's state is drawn with, and its tone. */
export function statusWord(e: EngineDef): { word: string; tone: "emerald" | "amber" | "neutral" | "rose" } {
  switch (e.status.state) {
    case "live":
      return { word: "live", tone: "emerald" };
    case "manual":
      return { word: "round trip", tone: "amber" };
    case "off":
      return { word: "off here", tone: "rose" };
    case "not-installed":
      return { word: "not installed", tone: "neutral" };
  }
}
