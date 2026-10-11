// A LEAF, BRIEFED — the SFX anatomy, the loop flag, the generate request one
// leaf makes, and the one-node patch. Separate because it is the per-leaf view
// of a hunt: each function here takes a leaf or its hunt, not the whole board.

import type {
  GenerateRequest,
  Hunt,
  HuntNode,
} from "@/lib/sound/types";

/* ── a leaf, briefed ───────────────────────────────────────────────────── */

/**
 * Whether an SFX leaf asks for a loop. The node's own `loop` decides
 * (HuntNode.loop, drafted by the sound-hunt turn since the r4 closeout). A
 * hunt stored before the field reads it as null, and only then is the prompt
 * read: a labelled `loop:` field in an envelope-first prompt — "loop: no" is a
 * one-shot, which a bare word match read as a loop (r2 capture: every UI tap
 * drew the loop glyph) — then the loop-seam technique or the prompt's words.
 * The glyph on the card and the flag the render sends are this one answer.
 */
export function loopOf(
  node: Pick<HuntNode, "technique" | "prompt" | "label"> & {
    loop?: boolean | null;
  },
): boolean {
  if (typeof node.loop === "boolean") return node.loop;
  const field = sfxAnatomy(node.prompt).find((a) => a.part === "loop");
  if (field) return /^(yes|true|on|seamless|loop)/i.test(field.text);
  return (
    node.technique.includes("loop-seam-acceptance") ||
    /(loop|loopable|looping|seamless loop)/i.test(
      `${node.label} ${node.prompt}`,
    )
  );
}

/** The envelope-first anatomy of an SFX prompt (media-generation /
 *  sound-effect-generation / envelope-first-briefing): the fields the drafter
 *  labelled, in the briefing order. Unlabelled prose yields nothing — the
 *  prompt is then shown as written, never re-parsed into a guess. */
export const SFX_PARTS = [
  "event",
  "material",
  "attack",
  "body",
  "tail",
  "space",
  "duration",
  "loop",
] as const;
export type SfxPart = (typeof SFX_PARTS)[number];

export function sfxAnatomy(prompt: string): { part: SfxPart; text: string }[] {
  const out: { part: SfxPart; text: string }[] = [];
  const re = new RegExp(
    `\\b(${SFX_PARTS.join("|")})\\s*:\\s*([^;·|\\n]+)`,
    "gi",
  );
  for (let m = re.exec(prompt); m; m = re.exec(prompt)) {
    const part = m[1].toLowerCase() as SfxPart;
    const text = m[2].trim().replace(/[.,]$/, "");
    if (text && !out.some((o) => o.part === part)) out.push({ part, text });
  }
  return out.sort(
    (a, b) => SFX_PARTS.indexOf(a.part) - SFX_PARTS.indexOf(b.part),
  );
}

/** The generate request one leaf makes, from the leaf's own fields — terms,
 *  tempo, key and loop are what the drafter stated beside the prompt, never
 *  re-read from its text. Nothing is clamped: a duration the engine refuses
 *  comes back as the engine's own words on the leaf. Prompt influence stays
 *  the vendor's default (null): a hunt varies the brief, not the knob. */
export function generateRequestFor(
  hunt: Pick<Hunt, "id" | "kind">,
  node: HuntNode,
): GenerateRequest {
  const sfx = hunt.kind === "sfx";
  return {
    kind: hunt.kind,
    provider: "elevenlabs",
    op: sfx ? "sfx" : "compose",
    prompt: node.prompt,
    negative: node.negative,
    durationS: node.durationS,
    loop: sfx ? loopOf(node) : null,
    promptInfluence: null,
    technique: [...node.technique],
    terms: {
      genre: [...node.terms.genre],
      mood: [...node.terms.mood],
      instrument: [...node.terms.instrument],
      sfxCategory: node.terms.sfxCategory,
    },
    tempoBpm: sfx ? null : node.tempoBpm,
    key: sfx ? null : node.key,
    origin: "hunt",
    sourceTakeId: null,
    editModes: null,
    plan: null,
    huntId: hunt.id,
    nodeId: node.id,
    title: node.label,
  };
}

/** Replace one node in the list, leaving the others untouched. */
export const withNode = (
  nodes: readonly HuntNode[],
  id: string,
  patch: Partial<HuntNode>,
): HuntNode[] => nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));
