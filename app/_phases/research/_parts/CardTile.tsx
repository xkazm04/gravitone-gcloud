"use client";

// The triage card. One notebook item, everything that decides whether it may go
// forward, and the signals that decide it.
//
// Two interaction rules this file exists to hold:
//
//  · THE CARD IS THE SCOPE TOGGLE. Scoping is the one thing you do to every card
//    on this surface, so it gets the whole target rather than a pill inside one.
//    `like` and `deepen` stay as buttons — they are occasional, and they must not
//    be reachable by accident while sweeping a column.
//
//    HOW THE WHOLE TARGET IS BUILT MATTERS, though, and it used to be built the
//    way that costs the most. The <li> itself took role="button" — and ARIA
//    gives `button` presentational children, so everything CardBody renders
//    (the confidence, the load-bearing flag, the source, the wound warning)
//    was dropped from the accessibility tree, and `aria-label` left the
//    accessible name as the claim alone. The `like` and `deepen` buttons were
//    inside that subtree and went with it: both actions were simply unreachable.
//    A screen reader got a column of unlabelled toggles over an argument it
//    could not read.
//
//    So the target is an overlay button covering the card instead of the card
//    pretending to be one. Same click area, same keyboard behaviour (now the
//    browser's, not a hand-rolled Enter/Space handler), and the body stays
//    ordinary readable content. The actions sit ABOVE the overlay rather than
//    inside it, which also retires the stopPropagation wrapper they needed
//    when a click on them was a click on the card.
//
//  · MUTED TEXT UNMUTES ON HOVER. The secondary text (reasoning, precedent,
//    falsifier, source) is muted so a column scans, but muted is not the same as
//    unreadable — hovering a card brings every line up to full contrast on a
//    linear transition, so "what is the pattern behind this conclusion?" is a
//    hover away rather than a squint.

import { ConfidenceChip, EvidenceClassChip } from "../../_shared/notebook/Chips";
import type { Leap } from "../../_shared/notebook/conclusions";
import { stateOf, type Card, type Wound } from "../scope";
import CardActions from "./CardActions";
import type { ScopeApi } from "../useScope";

export const KIND_LABEL: Record<Card["kind"], string> = {
  fact: "fact",
  mechanism: "mechanism",
  reversal: "reversal",
  "steel-man": "steel-man",
  conclusion: "conclusion",
};

// Keyed to `Leap` rather than `Record<string, string>`. The loose signature
// let `LEAP_TONE[card.leap ?? "moderate"]` compile against ANY string, so a
// leap tier added to the union in conclusions.ts (near/moderate/far/unhinged
// today) would fall through to `undefined` here and ship as
// `className="undefined"` — a card silently losing its tone instead of the
// build refusing to compile until this map grew a matching row.
const LEAP_TONE: Record<Leap, string> = {
  near: "border-white/15 bg-white/[0.05] text-white/65",
  moderate: "border-amber-400/30 bg-amber-400/[0.06] text-amber-200",
  far: "border-violet-400/35 bg-violet-400/[0.08] text-violet-200",
  unhinged: "border-rose-400/45 bg-rose-400/[0.10] text-rose-200",
};

/** One place for the hover-unmute rule, so every muted line lifts by the same
 *  amount, over the same duration, with the same curve. */
const lift = (base: string, hover: string) =>
  `${base} ${hover} transition-colors duration-200 ease-linear`;

export function CardBody({ card, wound }: { card: Card; wound?: Wound }) {
  const risky = card.kind === "fact" && card.loadBearing && card.confidence === "low";
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={lift("font-jetbrains text-label tracking-[0.12em] text-white/30", "group-hover:text-white/60")}>
          {card.id}
        </span>
        <span className={lift("font-jetbrains rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-label tracking-[0.1em] text-white/45", "group-hover:text-white/75")}>
          {KIND_LABEL[card.kind]}
        </span>
        {card.loadBearing && (
          <span className="font-jetbrains rounded border border-cyan-400/25 bg-cyan-400/[0.06] px-1.5 py-0.5 text-label tracking-[0.1em] text-cyan-200/90">
            load-bearing
          </span>
        )}
        {card.confidence && <ConfidenceChip c={card.confidence} />}
        {card.hottest && (
          <span
            data-testid="hottest-badge"
            title="The hottest take — a claim about motive, offered as speculation. Held to a higher bar, not a lower one."
            className="font-jetbrains rounded border border-rose-400/45 bg-rose-400/10 px-1.5 py-0.5 text-label tracking-[0.1em] text-rose-200"
          >
            😈 hottest take
          </span>
        )}
        {card.required && (
          <span className="font-jetbrains rounded border border-amber-400/30 bg-amber-400/[0.06] px-1.5 py-0.5 text-label tracking-[0.1em] text-amber-200">
            required
          </span>
        )}
      </div>

      <p className="mt-2 text-content leading-relaxed text-slate-300 transition-colors duration-200 ease-linear group-hover:text-slate-100">
        {card.title}
      </p>
      {card.detail && (
        <p className={lift("mt-1.5 text-content leading-relaxed text-white/45", "group-hover:text-white/80")}>
          {card.detail}
        </p>
      )}

      {card.kind === "conclusion" && (
        <div className="mt-2.5 space-y-2 border-l-2 border-violet-400/25 pl-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`font-jetbrains rounded border px-1.5 py-0.5 text-label tracking-[0.1em] ${LEAP_TONE[card.leap ?? "moderate"]}`}>
              {card.leap} leap
            </span>
            <span className={lift("font-jetbrains rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-label tracking-[0.1em] text-white/45", "group-hover:text-white/75")}>
              would be the {card.useFor}
            </span>
            <span className={lift("font-jetbrains text-label text-white/30", "group-hover:text-white/60")}>
              {card.hottest ? "speculation about motive — not reporting" : "no direct source — reasoned"}
            </span>
          </div>
          {card.precedent && (
            <p className={lift("text-content leading-relaxed text-white/55", "group-hover:text-white/85")}>
              <span className="font-jetbrains text-label tracking-[0.12em] text-violet-200/80 uppercase transition-colors duration-200 ease-linear group-hover:text-violet-200">
                pattern · {card.precedent.domain}
              </span>
              <br />
              {card.precedent.note}
            </p>
          )}
          {card.falsifiableBy && (
            <p className={lift("text-content leading-relaxed text-white/50", "group-hover:text-white/80")}>
              <span className={lift("font-jetbrains text-label tracking-[0.12em] text-white/35 uppercase", "group-hover:text-white/70")}>
                wrong if
              </span>
              <br />
              {card.falsifiableBy}
            </p>
          )}
        </div>
      )}

      {/* STRUCTURED SOURCES, where the fact carries them. `buildCards` used to
          write `source: f.source` and drop `sources` on the floor entirely, so
          the one migrated row's evidence class never reached this board —
          FactRow.tsx (the evidence log) could draw it and the triage board,
          the surface that actually decides what a script may use, could not.
          Compact by design: this is a dense board card, not the evidence log,
          so one chip + name + locator per source rather than FactRow's fuller
          layout (no confidenceNote line here). "A source a reader cannot
          navigate to is a name, not a source" (FactRow.tsx) — absent is drawn
          as absent, never omitted. Falls back to the legacy `card.source` line
          below so the twenty unmigrated cards look exactly as before. */}
      {card.sources?.length ? (
        <ul className="mt-1.5 space-y-1">
          {card.sources.map((s, i) => (
            <li key={`${s.name}-${i}`} className="flex flex-wrap items-center gap-1.5">
              <EvidenceClassChip c={s.evidenceClass} interested={s.interested} />
              <span className={lift("font-jetbrains text-label text-white/45", "group-hover:text-white/75")}>
                {s.name}
              </span>
              <span className={lift("font-jetbrains text-label text-white/28", "group-hover:text-white/60")}>
                {s.locator ?? "no locator"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        card.source && (
          <p className={lift("font-jetbrains mt-1.5 text-content text-white/28", "group-hover:text-white/60")}>
            {card.source} · as of {card.asOf}
          </p>
        )
      )}

      {risky && (
        <p className="font-jetbrains mt-2 text-content text-rose-300">
          load-bearing at low confidence — needs a second source before any script may state it
        </p>
      )}
      {wound && (
        <p
          className={`font-jetbrains mt-2 text-label ${
            wound.severity === "broken" ? "text-rose-300" : "text-amber-200"
          }`}
        >
          {wound.severity === "broken" ? "cannot stand — " : "weakened — "}
          {wound.missing.join(", ")} descoped
        </p>
      )}
    </>
  );
}

/** The scope state, now that the toggle is the card itself. Without this the
 *  only signal would be the border, and a border alone does not say which of
 *  "cut" and "not yet taken" it means. */
function ScopeChip({ card, descoped }: { card: Card; descoped: boolean }) {
  if (card.required)
    return (
      <span className="font-jetbrains rounded-full border border-white/10 px-2 py-0.5 text-label tracking-[0.1em] text-white/30">
        locked in scope
      </span>
    );
  const label = card.optIn
    ? descoped ? "not taken" : "taken"
    : descoped ? "descoped" : "in scope";
  return (
    <span
      data-testid={`scope-state-${card.id}`}
      className={`font-jetbrains rounded-full border px-2 py-0.5 text-label tracking-[0.1em] ${
        descoped
          ? "border-amber-400/50 bg-amber-400/[0.08] text-amber-200"
          : card.optIn
            ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200"
            : "border-white/12 text-white/45"
      }`}
    >
      {label}
    </span>
  );
}

export default function CardTile({ card, api, wound }: { card: Card; api: ScopeApi; wound?: Wound }) {
  const s = stateOf(api.scope, card.id);
  const locked = !!card.required;

  return (
    <li
      data-testid={`card-${card.id}`}
      data-descoped={s.descoped ? "true" : "false"}
      title={locked ? card.requiredWhy : undefined}
      // Descoped is signalled by the BORDER, never by fading the text. Muting a
      // card is self-defeating on a surface whose whole job is deciding what
      // stays: you cannot judge what you cannot read, and the card you most need
      // to re-read is the one you just cut.
      className={`group relative rounded-xl border px-3.5 py-3 transition-colors duration-200 ease-linear ${
        s.descoped
          ? "border-amber-400/55 bg-amber-400/[0.03] hover:border-amber-400/80"
          : wound?.severity === "broken"
            ? "border-rose-400/30 bg-rose-400/[0.04] hover:border-rose-400/60"
            : wound
              ? "border-amber-400/25 bg-amber-400/[0.03] hover:border-amber-400/50"
              : "border-white/8 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]"
      }`}
    >
      {/* The whole-card target, as a real button laid over the card rather than
          as a role on the card. It covers everything except the two action
          pills, which sit above it. Bare `absolute inset-0` — it draws nothing
          of its own; the card's border and background are the visual. */}
      {!locked && (
        <button
          type="button"
          data-testid={`scope-toggle-${card.id}`}
          onClick={() => api.toggle(card.id, "descoped")}
          aria-pressed={!s.descoped}
          aria-label={`${s.descoped ? "Include" : "Exclude"}: ${card.title}`}
          title={
            card.optIn
              ? "Click to take this conclusion into the script. Conclusions are off by default."
              : "Click to descope. Reversible."
          }
          className="absolute inset-0 z-10 cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2"
        />
      )}

      <CardBody card={card} wound={wound} />

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <ScopeChip card={card} descoped={s.descoped} />
        {/* Above the overlay, so a click here is never a click on the card —
            sweeping a column must never mark something "liked" by accident.
            This is what the stopPropagation wrapper used to buy, back when the
            actions were nested inside the target rather than beside it. */}
        <div className="relative z-20">
          <CardActions card={card} api={api} compact />
        </div>
      </div>
    </li>
  );
}
