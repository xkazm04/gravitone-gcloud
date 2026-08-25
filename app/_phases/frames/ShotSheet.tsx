"use client";

// The shot sheet — READ-ONLY, and the read-only is the design.
//
// It shows the decomposition a trailer's beat chain implies, and the review of
// it. There is no editor here and no generate button: a `Shot` owns no plate,
// and this surface deliberately offers no path from a shot to an image. When
// the decomposition is wrong the fix is in the beat chain or in `shots.ts`, not
// in a text field on this page.
//
// For a non-trailer render it renders a statement of absence rather than an
// empty table. An explainer beat IS one composed picture; saying "0 shots"
// would imply the layer applies and found nothing, which is the opposite of
// what is true.
//
// It also shows the PROPOSED text-to-image prompt per shot. Proposed is the
// operative word: there is no button beside it, this module imports nothing
// from `lib/imaging/**`, and the only thing the page can do with a prompt is
// let you read it. Prompt WORDING is deliberately unscored here — see the
// header of ./shotPrompt and the named gaps at the bottom of the page.

import {
  isTrailerFormat,
  shotsByBeat,
  shotsFromRender,
  unplaceableBeats,
  type Shot,
  type ShotSourceRender,
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
      <span className={`font-jetbrains text-[11px] ${VERDICT_STYLE[c.verdict]}`}>{c.rule}</span>
      <span className="text-[12px] leading-snug text-white/45">
        {c.tests}
        <span className="block text-white/30">{c.detail}</span>
      </span>
      {/* The number that makes the verdict readable. A `pass` next to `0`
          cannot happen — `finalise()` downgrades it — so this column is how a
          reader sizes the green rather than trusting it. */}
      <span className={`font-jetbrains text-right text-[11px] ${VERDICT_STYLE[c.verdict]}`}>
        {c.verdict} · {c.examined}
      </span>
    </div>
  );
}

function ShotRow({ s, prompt }: { s: Shot; prompt?: ShotPrompt }) {
  return (
    <div className="grid grid-cols-[38px_52px_60px_60px_88px_1fr_78px] items-center gap-2 border-b border-white/5 px-3 py-1.5 last:border-b-0">
      <span className="font-jetbrains text-[11px] text-white/25">
        {s.ordinal}/{s.ofBeat}
      </span>
      <span className="font-jetbrains text-[11px] text-white/55">{s.holdS}s</span>
      <span className={`font-jetbrains text-[11px] ${PACE_STYLE[s.pace]}`}>{s.pace}</span>
      {/* Absence, stated. An undeclared size is not "none", it is nobody's
          decision yet — the same reading `Plate.state === "empty"` gets. */}
      <span className="font-jetbrains text-[11px] text-white/55">{s.size ?? "—"}</span>
      <span className="font-jetbrains text-[11px] text-white/35">
        {s.direction.replace("screen-", "")}
        {s.placement ? ` · ${s.placement}` : ""}
      </span>
      {/* The proposed action block, whole in the tooltip. The motion is the one
          field this layer refuses to seed, so its absence is named on the row
          rather than left blank. */}
      <span className="truncate text-[11px] text-white/25" title={prompt?.text ?? s.basis}>
        {prompt?.action ?? "—"}
      </span>
      <span
        className={`font-jetbrains text-right text-[10px] ${
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
  render,
  block,
  hasLockedStyle,
}: {
  render: ShotSourceRender & { title: string };
  block: StyleBlock;
  /** False means `block` is a fallback preset, not this project's identity — the
   *  same distinction the assembly header colours in amber, and it matters more
   *  here because every prompt on the page restates it. */
  hasLockedStyle: boolean;
}) {
  if (!isTrailerFormat(render.template)) {
    return (
      <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-6">
        <p className="text-[13px] leading-relaxed text-white/45">
          &ldquo;{render.title}&rdquo; is a <span className="text-white/70">{render.template}</span>. Shot
          decomposition applies to promotional cuts only — in an explainer a beat <em>is</em> one composed
          picture held while a sentence is spoken, and the frame list is already that.
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-white/30">
          Nothing was derived here, and nothing about the assembly changed. This is not an empty result.
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
      <p className="font-jetbrains text-[11px] text-white/35">
        {report.shots} shots across {report.beats} beats · {report.engaged}/{report.checks.length} checks
        examined anything · derived, not authored
      </p>

      {/* Stated rather than assumed, for the same reason the assembly header
          states it: a fallback preset is not the project's style, and every
          prompt below restates whichever one this is. */}
      {!hasLockedStyle && (
        <p className="rounded-xl border border-amber-300/25 bg-amber-300/5 px-4 py-2.5 text-[12px] leading-snug text-amber-100/90">
          These prompts restate a fallback style preset, not this project&rsquo;s locked style. Lock a style
          before reading them as the identity the plates would come back in.
        </p>
      )}

      {unplaceable.length > 0 && (
        <p className="rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-2.5 text-[12px] leading-snug text-rose-200">
          {unplaceable.length} beat{unplaceable.length === 1 ? "" : "s"} could not be placed and derived no
          shots — {unplaceable.map((b) => `"${b.at}"`).join(", ")} {unplaceable.length === 1 ? "is" : "are"}{" "}
          not a timecode. Nothing here guessed a position for them.
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-white/8">
        <div className="font-jetbrains grid grid-cols-[38px_52px_60px_60px_88px_1fr_78px] gap-2 border-b border-white/8 bg-white/[0.02] px-3 py-2 text-[10px] tracking-[0.14em] text-white/35 uppercase">
          <span>#</span>
          <span>holds</span>
          <span>pace</span>
          <span>size</span>
          <span>facing</span>
          <span>proposed prompt (action block)</span>
          <span className="text-right">len</span>
        </div>
        {groups.map((g) => (
          <div key={g.beatAt}>
            <div className="flex items-baseline gap-3 border-b border-white/5 bg-white/[0.015] px-3 py-1.5">
              <span className="font-jetbrains text-[11px] text-white/40">{g.beatAt}</span>
              <span className="truncate text-[12px] text-white/60">{g.beatLabel}</span>
              <span className="font-jetbrains ml-auto shrink-0 text-[10px] text-white/25">
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
        <p className="font-jetbrains border-b border-white/8 bg-white/[0.02] px-3 py-2 text-[10px] tracking-[0.14em] text-white/35 uppercase">
          review · verdict · sites examined
        </p>
        {report.checks.map((c) => (
          <CheckRow key={c.rule} c={c} />
        ))}
      </div>

      {/* The gaps, on the page rather than in a file nobody opens. A green
          report is only worth what this list does not contain. */}
      <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
        <p className="font-jetbrains text-[10px] tracking-[0.14em] text-white/35 uppercase">not checked</p>
        <ul className="mt-2 space-y-1.5">
          {report.notChecked.map((n) => (
            <li key={n} className="text-[12px] leading-snug text-white/35">
              · {n}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
