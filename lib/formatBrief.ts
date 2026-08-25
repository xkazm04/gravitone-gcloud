// FORMAT → PROMPT. The second compiler, alongside lib/stylePrompt.ts.
//
// A project record has always known two things the art-direction pass never saw:
// WHAT KIND OF PIECE this is (`Project.template`) and HOW LONG it is meant to run
// (`Project.targetS`). Both were display-only — a label on the studio header and a
// duration in the projects matrix — so every cut, from a thirty-second clip to a
// six-minute argument, was directed against the same brief. This module is the
// table that turns the first into instruction, and `compileFormatBrief` is the one
// place it is rendered.
//
// WHY IT IS NOT IN lib/projects.ts, WHERE THE TEMPLATE CATALOGUE LIVES.
// That module is `"use client"` and it imports lib/studioDb — IndexedDB. A route
// handler can have neither: the directive turns its exports into client references
// on the server side of the boundary, and the store it opens does not exist in
// Node. lib/model.ts already records this exact split in its own header ("its own
// module so a client component can name it without importing lib/claudeCli.ts"),
// and this is the same seam pointed the other way — a server route naming
// something the client owns. Only the TYPE crosses, and a type is erased before
// any of that matters.
//
// WHAT MAY GO IN THE TABLE. knowledge/README.md's evidence contract governs this
// file, because every line here lands in a prompt as instruction and a model
// cannot tell an impression from a measurement. So: every number carries its
// label (MEASURED / OBSERVED / INFERRED / ASSUMED) and the document it came from,
// and where the craft library has measured nothing — which is the case for FRAME
// density in every one of these formats; see
// knowledge/templates/short-educational-video/steps/02-frames/PATTERNS.md, "No
// `params.json` yet — on purpose" — the brief says so out loud instead of
// supplying a figure. tests/golden-path/format-brief.probe.spec.ts holds that
// rule as a gate rather than as this paragraph.
//
// The only unlabelled number in the rendered block is the project's own
// `targetS`, and it is not a claim about craft: it is what the director asked for.

import type { TemplateId } from "./projects";

export interface FormatBrief {
  /** How to name this format to the director, in prose. */
  name: string;
  /** One line: what a piece in this format IS. Names the source document, so a
   *  reader who doubts the direction notes can go and check them. */
  what: string;
  /** What the format changes about DIRECTION — rule-shaped, each naming the
   *  failure it prevents. A number appears only with its evidence label. */
  direction: string[];
}

/**
 * The table. Keyed by `TemplateId`, which is what makes a new format ONE ENTRY
 * rather than a new branch — and, because the key type is exhaustive, a template
 * added to `TEMPLATES` with no brief here is a typecheck failure rather than a
 * silently format-blind run.
 */
export const FORMAT_BRIEFS: Record<TemplateId, FormatBrief> = {
  "short-form-clip": {
    name: "a short-form clip",
    what:
      "One idea, opened at 0:00 with no setup and no branding, and there is no second act to " +
      "recover in. (MEASURED · n=3 · knowledge/templates/short-form-clip/TEMPLATE.md)",
    direction: [
      "**The first frame is the whole hook.** All three studied clips open with zero setup and zero " +
        "branding (OBSERVED · all three, same file). Spend your most legible composition on the first " +
        "beat: an establishing frame here spends the only attention the piece is given on saying nothing.",
      "**One idea means one motif, held.** There is no room to establish a shape, vary it and pay it " +
        "off. A motif introduced and then abandoned at this length does not read as an arc — it reads " +
        "as two unrelated pictures.",
      "**Density is the enemy here, not the goal.** Every frame is competing with the narration for " +
        "the same few seconds. One legible thing per plate.",
      "**The corpus runs 40–60s and nothing below 40s has been measured** — the template states that " +
        "gap in its own words rather than covering it. If this piece targets less than that, you are " +
        "directing outside what anyone has checked: compose conservatively, and say in `rationale` " +
        "where the compression cost you something.",
    ],
  },
  "short-educational-video": {
    name: "a short educational video",
    what:
      "A question chain with facts hung on it — one thesis, one narrator, one idea explained well. " +
      "Not facts arranged on a timeline. (knowledge/templates/short-educational-video/TEMPLATE.md)",
    direction: [
      "**Every frame is answering the same question.** The format holds exactly one thesis (OBSERVED · " +
        "all four sources, same file). A plate that would sit equally well in a different video about " +
        "a different thesis is decoration, however good it looks.",
      "**The question is asked aloud inside the first 12 seconds** (MEASURED · n=4, same file). Those " +
        "are the frames on which a viewer decides whether to stay — make them the most legible in the " +
        "cut, not the most decorated.",
      "**There is room for about two reversals, not five.** A short-form reversal runs ~18–25s " +
        "(MEASURED, same file), so a piece of this length holds two turns comfortably. Those two turn " +
        "beats are your two most distinct frames; if four frames are all competing to be the loudest, " +
        "the cut has no spine.",
      "**Nothing about frame density in this format has been measured.** The step's own craft file is " +
        "n=1 and deliberately ships no `params.json`. There is no frames-per-minute target to hit, so " +
        "do not pace toward one.",
    ],
  },
  "mid-educational-video": {
    name: "a mid-length educational video",
    what:
      "Three to six minutes — the shortest length that holds a full argument: a claim, a mechanism, a " +
      "real objection and a verdict. (knowledge/templates/mid-educational-video/TEMPLATE.md)",
    direction: [
      "**The movements are announced, and the picture should announce them too.** The format runs 2–3 " +
        "movements and 3–5 turns (MEASURED · n=3, same file). A movement boundary is where the " +
        "composition should visibly change register — camera, axis or count — because a cut whose " +
        "movements look alike is a five-minute video with one act.",
      "**This is the only one of these formats with room to establish, vary and pay off.** A motif " +
        "planted in the hook can return at a turn and mean something. Use it, and say so in " +
        "`rationale` when you do.",
      "**Long enough to ramble, and the picture rambles first.** A frame that restates the one before " +
        "it costs the viewer a minute of a format whose whole discipline is that every beat earns its " +
        "place.",
      "**The subjects are contested — economy, tech, politics** (stated by the template). A plate that " +
        "visually takes a side the script does not take is an argument nobody wrote and nobody can " +
        "check.",
    ],
  },
};

/** The table as a plain lookup, so an id off the wire can be tested against it
 *  without being asserted into `TemplateId` first. */
const BY_ID: Readonly<Record<string, FormatBrief>> = FORMAT_BRIEFS;

/** The brief for an id that arrived over the wire, or `null` if this is not a
 *  format we know. Never guesses: an unrecognised id is absence, not the default.
 *  (`templateOf` in lib/projects.ts falls back to the middle template, which is
 *  right for a dropdown and wrong here — a fallback would put a format the user
 *  never chose into the model's instructions with nothing saying so.) */
export function formatBriefFor(template: unknown): FormatBrief | null {
  if (typeof template !== "string") return null;
  return BY_ID[template] ?? null;
}

/** `120` → `"120s (2:00)"`, `45` → `"45s"`. Null for anything that is not a real
 *  duration, so a bad number is reported as absent rather than printed. */
export function runtimeWords(targetS: unknown): string | null {
  if (typeof targetS !== "number" || !Number.isFinite(targetS) || targetS <= 0) return null;
  const s = Math.round(targetS);
  if (s < 60) return `${s}s`;
  return `${s}s (${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")})`;
}

/**
 * The format half of THE RUN — what kind of piece this is, how long it runs, and
 * what both change about the direction.
 *
 * Both inputs are `unknown` on purpose: they arrive as JSON from a browser, and
 * the seam that decides whether they can be trusted belongs here rather than at
 * each call site. Neither is ever invented. A format this module does not know,
 * or a runtime it cannot read, produces a block that SAYS SO — the prompt's
 * `## The format` section carries the matching rule, that a director told no
 * format directs the beats in front of it rather than assuming a shape.
 */
export function compileFormatBrief(template: unknown, targetS: unknown): string {
  const brief = formatBriefFor(template);
  const runtime = runtimeWords(targetS);

  if (!brief)
    return [
      "## THE FORMAT — NOT STATED",
      "",
      "This run arrived without a format this studio recognises" +
        (runtime ? `, though its target runtime is ${runtime}` : "") +
        ".",
      "Do not guess one. Direct the beats you were given, and where a choice would have turned on the",
      "length or the kind of piece, say so in that scene's `rationale` instead of assuming a shape.",
    ].join("\n");

  return [
    "## THE FORMAT — what kind of piece this is",
    "",
    `This is **${brief.name}**. ${brief.what}`,
    "",
    runtime
      ? `**Target runtime: ${runtime}.** That is the director's own target for THIS piece — not a band ` +
        "borrowed from the craft library, and not a length you should edit the beats to reach."
      : "**No target runtime was sent with this run.** Direct the beats you have; do not assume a length.",
    "",
    "What the format changes about your direction:",
    "",
    ...brief.direction.map((d) => `- ${d}`),
  ].join("\n");
}
