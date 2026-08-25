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

import {
  isTrailerFormat,
  shotsByBeat,
  shotsFromRender,
  type Shot,
  type ShotSourceRender,
} from "./shots";
import { reviewShotList, type ShotCheck, type ShotVerdict } from "./shotReview";

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

function ShotRow({ s }: { s: Shot }) {
  return (
    <div className="grid grid-cols-[38px_58px_66px_74px_96px_1fr] items-center gap-2 border-b border-white/5 px-3 py-1.5 last:border-b-0">
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
      <span className="truncate text-[11px] text-white/25" title={s.basis}>
        {/* The motion is the one field this layer refuses to seed, so it reads
            as unauthored rather than as blank. */}
        {s.motion.trim() || "motion · not authored"}
      </span>
    </div>
  );
}

export default function ShotSheet({ render }: { render: ShotSourceRender & { title: string } }) {
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
  const report = reviewShotList(shots);

  return (
    <div className="space-y-4">
      <p className="font-jetbrains text-[11px] text-white/35">
        {report.shots} shots across {report.beats} beats · {report.engaged}/{report.checks.length} checks
        examined anything · derived, not authored
      </p>

      <div className="overflow-hidden rounded-xl border border-white/8">
        <div className="font-jetbrains grid grid-cols-[38px_58px_66px_74px_96px_1fr] gap-2 border-b border-white/8 bg-white/[0.02] px-3 py-2 text-[10px] tracking-[0.14em] text-white/35 uppercase">
          <span>#</span>
          <span>holds</span>
          <span>pace</span>
          <span>size</span>
          <span>facing</span>
          <span>motion</span>
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
              <ShotRow key={s.id} s={s} />
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
