"use client";

// The shot sheet — READ-ONLY, and the read-only is the design.
//
// It shows the decomposition a trailer's beat chain implies, and the review of
// it. There is no editor here and no generate button: a `Shot` owns no plate,
// and this surface deliberately offers no path from a shot to an image. When
// the decomposition is wrong the fix is in the beat chain or in `shots.ts`, not
// in a text field on this page.
//
// THERE ARE TWO ABSENCES HERE AND THEY ARE DIFFERENT SENTENCES.
//
// For a non-trailer render it says the layer does not APPLY: an explainer beat
// IS one composed picture, and the frame list is already that. For a trailer
// project whose spine nobody has composed it says the CHAIN IS MISSING, and
// points at the step that writes one. Both are drawn instead of an empty table,
// because "0 shots" would claim the layer ran and found nothing — which in the
// first case is a category error and in the second is a lie about the creator's
// own work.
//
// Until the chain was resolved from the project record neither sentence could
// be reached: every project was handed the explainer fixture, so a trailer
// project read its own step as "shot decomposition applies to promotional cuts
// only" — about somebody else's script.
//
// It also shows the PROPOSED text-to-image prompt per shot. Proposed is the
// operative word: there is no button beside it, this module imports nothing
// from `lib/imaging/**`, and the only thing the page can do with a prompt is
// let you read it. Prompt WORDING is deliberately unscored here — see the
// header of ./shotPrompt and the named gaps at the bottom of the page.

import { Unlock } from "lucide-react";

import { CHIP_CLASS, Hint, TALLY_TONE, Tally, UpstreamBreak } from "@/components/ui/signal";
import type { PhaseKey } from "@/lib/projects";

import type { FramesRender } from "./frames";
import {
  isTrailerFormat,
  shotsByBeat,
  shotsFromRender,
  unplaceableBeats,
  type Shot,
} from "./shots";
import { promptsForShots, type ShotPrompt } from "./shotPrompt";
import { reviewShotList, type ShotCheck, type ShotVerdict } from "./shotReview";
import type { StyleBlock } from "@/lib/themes";

const VERDICT_STYLE: Record<ShotVerdict, string> = {
  pass: "text-emerald-200/80",
  violation: "text-rose-200",
  // Not amber. An empty population is fine, and colouring it like a problem
  // trains a reader to ignore the colour that does mean one.
  "not-engaged": "text-white/30",
  unmeasured: "text-amber-200/90",
};

const PACE_STYLE: Record<Shot["pace"], string> = {
  rapid: "text-rose-200/70",
  measured: "text-white/50",
  held: "text-cyan-200/70",
};

function CheckRow({ c }: { c: ShotCheck }) {
  return (
    <div className="grid grid-cols-[150px_1fr_78px] items-start gap-3 border-b border-white/5 px-3 py-2 last:border-b-0">
      <span className={`font-jetbrains text-label ${VERDICT_STYLE[c.verdict]}`}>{c.rule}</span>
      <span className="text-label leading-snug text-white/45">
        {c.tests}
        <span className="block text-white/30">{c.detail}</span>
      </span>
      {/* The number that makes the verdict readable. A `pass` next to `0`
          cannot happen — `finalise()` downgrades it — so this column is how a
          reader sizes the green rather than trusting it. */}
      <span className={`font-jetbrains text-right text-label ${VERDICT_STYLE[c.verdict]}`}>
        {c.verdict} · {c.examined}
      </span>
    </div>
  );
}

function ShotRow({ s, prompt }: { s: Shot; prompt?: ShotPrompt }) {
  return (
    <div className="grid grid-cols-[38px_52px_60px_60px_88px_1fr_78px] items-center gap-2 border-b border-white/5 px-3 py-1.5 last:border-b-0">
      <span className="font-jetbrains text-label text-white/25">
        {s.ordinal}/{s.ofBeat}
      </span>
      <span className="font-jetbrains text-label text-white/55">{s.holdS}s</span>
      <span className={`font-jetbrains text-label ${PACE_STYLE[s.pace]}`}>{s.pace}</span>
      {/* Absence, stated. An undeclared size is not "none", it is nobody's
          decision yet — the same reading `Plate.state === "empty"` gets. */}
      <span className="font-jetbrains text-label text-white/55">{s.size ?? "—"}</span>
      <span className="font-jetbrains text-label text-white/35">
        {s.direction.replace("screen-", "")}
        {s.placement ? ` · ${s.placement}` : ""}
      </span>
      {/* The proposed action block, whole in the tooltip. The motion is the one
          field this layer refuses to seed, so its absence is named on the row
          rather than left blank. */}
      <span className="truncate text-label text-white/25" title={prompt?.text ?? s.basis}>
        {prompt?.action ?? "—"}
      </span>
      <span
        className={`font-jetbrains text-right text-label ${
          prompt?.subjectMissing ? "text-amber-200/80" : "text-white/25"
        }`}
        title={
          s.motion.trim()
            ? `move: ${s.motion.trim()}`
            : "no move authored — this layer does not invent one"
        }
      >
        {prompt ? `${prompt.chars}c` : ""}
        {s.motion.trim() ? "" : " ·no move"}
      </span>
    </div>
  );
}

export default function ShotSheet({
  projectId,
  render,
  block,
  hasLockedStyle,
  donePhases,
}: {
  /** For the one control the blocked branch offers: a way to the step that
   *  composes a spine. */
  projectId: string;
  /** The chain this step resolved from the PROJECT'S OWN RECORD — see
   *  ./frames#FramesRender. `origin` is read rather than inferred, because the
   *  two absences below are indistinguishable from the beats alone. */
  render: FramesRender;
  block: StyleBlock;
  /** False means `block` is a fallback preset, not this project's identity — the
   *  same distinction the assembly header colours in amber, and it matters more
   *  here because every prompt on the page restates it. */
  hasLockedStyle: boolean;
  /** The steps that have produced something — the filled dots of the chain.
   *  Read off the project record by `useFrames`, never guessed here. */
  donePhases: PhaseKey[];
}) {
  // A TRAILER PROJECT WITH NOTHING COMPOSED. Absence, named, with the step that
  // ends it — not an empty grid, and not the explainer's fixture standing in.
  if (render.origin === "no-spine") {
    return (
      <UpstreamBreak
        blockedAt="script"
        current="frames"
        done={donePhases}
        action={{ label: "Compose the cut", href: `/studio/${projectId}?step=script` }}
        detail={render.title}
      />
    );
  }

  // NOT AN EMPTY RESULT — a layer that does not apply, drawn as one. A struck
  // grid of shot cells over the template's own name says the category error
  // ("0 shots" would claim the layer ran and found nothing) without the two
  // paragraphs that used to teach what an explainer beat is.
  if (!isTrailerFormat(render.template)) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-8">
        <span
          role="img"
          aria-label={`shot decomposition does not apply to a ${render.template}`}
          className="relative grid grid-cols-3 gap-1.5 opacity-40"
        >
          {Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className="block h-5 w-8 rounded-sm border border-dashed border-white/30"
            />
          ))}
          <span
            aria-hidden
            className="absolute top-1/2 -left-2 h-px w-[calc(100%+1rem)] -rotate-12 bg-white/45"
          />
        </span>
        <p className="font-jetbrains text-content tracking-[0.12em] text-white/40 uppercase">
          not applicable · {render.template}
        </p>
      </div>
    );
  }

  const shots = shotsFromRender(render);
  const groups = shotsByBeat(shots);
  // The style half is the project's and is restated in every prompt — the law
  // is `style-is-restated-not-remembered`, and `promptsForShots` cannot be
  // called without a block, which is how it is honoured rather than remembered.
  // Beats whose timecode does not parse derive no shots at all. Named here
  // rather than quietly missing from the table — a shot list short by two rows
  // and silent about it is the failure mode this page exists against.
  const unplaceable = unplaceableBeats(render.beats);
  const prompts = promptsForShots(shots, block);
  const byShot = new Map(prompts.map((p) => [p.shotId, p]));
  const report = reviewShotList(shots, prompts, block);

  return (
    <div className="space-y-4">
      {/* THE COUNTS, AS COUNTS. This line used to read "{n} shots across {m}
          beats · {e}/{c} checks examined anything · derived, not authored". Two
          of those clauses were the page describing its own posture; the third,
          "examined anything", is what a check's own `examined` column already
          says row by row. WHOSE beats these are stays, because this page spent
          its whole life decomposing a fixture. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-jetbrains text-content tracking-[0.14em] text-white/30 uppercase">
          derived
        </span>
        <Tally label="shots" value={report.shots} />
        <Tally label="beats" value={report.beats} />
        <Tally label="checks" value={report.engaged} of={report.checks.length} />
        <span className={`${CHIP_CLASS} ${TALLY_TONE.neutral}`}>
          {render.origin === "trailer-cut" ? (
            <>
              <span aria-hidden className="uppercase opacity-50">
                spine
              </span>
              <span className="sr-only">from this project’s composed spine, target</span>
              <span className="text-white/85">{render.durationS}s</span>
            </>
          ) : (
            <span className="text-white/85">fixture chain</span>
          )}
        </span>
      </div>

      {/* Stated rather than assumed, for the same reason the assembly header
          states it: a fallback preset is not the project's style, and every
          prompt below restates whichever one this is. */}
      {!hasLockedStyle && (
        <a
          href="/library"
          className={`${CHIP_CLASS} ${TALLY_TONE.amber} w-fit transition hover:bg-amber-400/[0.14] focus-visible:outline-2 focus-visible:outline-offset-2`}
        >
          <Unlock className="h-3.5 w-3.5" aria-hidden />
          fallback style
          <Hint variant="lock" tone="amber" label="what a fallback style means here">
            every prompt below restates this preset, not a locked identity
          </Hint>
        </a>
      )}

      {/* BEATS THAT ARE NOT ON THE CLOCK, sitting off it — one amber dashed
          chip per beat, carrying the `at` string that is not a timecode. The
          sentence this replaces named them in prose and then explained, in a
          third clause, that nothing had guessed a position for them. */}
      {unplaceable.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="sr-only">beats that could not be placed and derived no shots:</span>
          <Tally label="unplaced" value={unplaceable.length} tone="amber" />
          {unplaceable.map((b, i) => (
            <span
              key={`${b.at}-${i}`}
              className={`${CHIP_CLASS} border-dashed ${TALLY_TONE.amber}`}
            >
              {b.at || "—"}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-white/8">
        <div className="font-jetbrains grid grid-cols-[38px_52px_60px_60px_88px_1fr_78px] gap-2 border-b border-white/8 bg-white/[0.02] px-3 py-2 text-label tracking-[0.14em] text-white/35 uppercase">
          <span>#</span>
          <span>holds</span>
          <span>pace</span>
          <span>size</span>
          <span>facing</span>
          <span>proposed prompt (action block)</span>
          <span className="text-right">len</span>
        </div>
        {/* Keyed by the group's FIRST SHOT, not by `beatAt`: a timecode is a
            position and positions repeat, so two beats at the same second used
            to hand React one key twice. A shot id is unique by construction. */}
        {groups.map((g) => (
          <div key={g.shots[0].id}>
            <div className="flex items-baseline gap-3 border-b border-white/5 bg-white/[0.015] px-3 py-1.5">
              <span className="font-jetbrains text-label text-white/40">{g.beatAt}</span>
              <span className="truncate text-label text-white/60">{g.beatLabel}</span>
              <span className="font-jetbrains ml-auto shrink-0 text-label text-white/25">
                {g.shots[0].basis}
              </span>
            </div>
            {g.shots.map((s) => (
              <ShotRow key={s.id} s={s} prompt={byShot.get(s.id)} />
            ))}
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-white/8">
        <p className="font-jetbrains border-b border-white/8 bg-white/[0.02] px-3 py-2 text-content tracking-[0.14em] text-white/35 uppercase">
          review · verdict · sites examined
        </p>
        {report.checks.map((c) => (
          <CheckRow key={c.rule} c={c} />
        ))}
      </div>

      {/* The gaps, on the page rather than in a file nobody opens. A green
          report is only worth what this list does not contain. */}
      <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
        <p className="font-jetbrains text-content tracking-[0.14em] text-white/35 uppercase">not checked</p>
        <ul className="mt-2 space-y-1.5">
          {report.notChecked.map((n) => (
            <li key={n} className="text-label leading-snug text-white/35">
              · {n}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
