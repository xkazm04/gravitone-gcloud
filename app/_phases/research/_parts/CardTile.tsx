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
//  · MUTED TEXT UNMUTES ON HOVER. The secondary text (reasoning, precedent,
//    falsifier, source) is muted so a column scans, but muted is not the same as
//    unreadable — hovering a card brings every line up to full contrast on a
//    linear transition, so "what is the pattern behind this conclusion?" is a
//    hover away rather than a squint.

import { ConfidenceChip } from "../../_shared/notebook/Chips";
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

const LEAP_TONE: Record<string, string> = {
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
        <span className={lift("font-jetbrains text-[10px] tracking-[0.12em] text-white/30", "group-hover:text-white/60")}>
          {card.id}
        </span>
        <span className={lift("font-jetbrains rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] tracking-[0.1em] text-white/45", "group-hover:text-white/75")}>
          {KIND_LABEL[card.kind]}
        </span>
        {card.loadBearing && (
          <span className="font-jetbrains rounded border border-cyan-400/25 bg-cyan-400/[0.06] px-1.5 py-0.5 text-[10px] tracking-[0.1em] text-cyan-200/90">
            load-bearing
          </span>
        )}
        {card.confidence && <ConfidenceChip c={card.confidence} />}
        {card.hottest && (
          <span
            data-testid="hottest-badge"
            title="The hottest take — a claim about motive, offered as speculation. Held to a higher bar, not a lower one."
            className="font-jetbrains rounded border border-rose-400/45 bg-rose-400/10 px-1.5 py-0.5 text-[10px] tracking-[0.1em] text-rose-200"
          >
            😈 hottest take
          </span>
        )}
        {card.required && (
          <span className="font-jetbrains rounded border border-amber-400/30 bg-amber-400/[0.06] px-1.5 py-0.5 text-[10px] tracking-[0.1em] text-amber-200">
            required
          </span>
        )}
      </div>

      <p className="mt-2 text-[13px] leading-relaxed text-slate-300 transition-colors duration-200 ease-linear group-hover:text-slate-100">
        {card.title}
      </p>
      {card.detail && (
        <p className={lift("mt-1.5 text-[12px] leading-relaxed text-white/45", "group-hover:text-white/80")}>
          {card.detail}
        </p>
      )}

      {card.kind === "conclusion" && (
        <div className="mt-2.5 space-y-2 border-l-2 border-violet-400/25 pl-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`font-jetbrains rounded border px-1.5 py-0.5 text-[10px] tracking-[0.1em] ${LEAP_TONE[card.leap ?? "moderate"]}`}>
              {card.leap} leap
            </span>
            <span className={lift("font-jetbrains rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] tracking-[0.1em] text-white/45", "group-hover:text-white/75")}>
              would be the {card.useFor}
            </span>
            <span className={lift("font-jetbrains text-[10px] text-white/30", "group-hover:text-white/60")}>
              {card.hottest ? "speculation about motive — not reporting" : "no direct source — reasoned"}
            </span>
          </div>
          {card.precedent && (
            <p className={lift("text-[12px] leading-relaxed text-white/55", "group-hover:text-white/85")}>
              <span className="font-jetbrains text-[10px] tracking-[0.12em] text-violet-200/80 uppercase transition-colors duration-200 ease-linear group-hover:text-violet-200">
                pattern · {card.precedent.domain}
              </span>
              <br />
              {card.precedent.note}
            </p>
          )}
          {card.falsifiableBy && (
            <p className={lift("text-[12px] leading-relaxed text-white/50", "group-hover:text-white/80")}>
              <span className={lift("font-jetbrains text-[10px] tracking-[0.12em] text-white/35 uppercase", "group-hover:text-white/70")}>
                wrong if
              </span>
              <br />
              {card.falsifiableBy}
            </p>
          )}
        </div>
      )}

      {card.source && (
        <p className={lift("font-jetbrains mt-1.5 text-[10px] text-white/28", "group-hover:text-white/60")}>
          {card.source} · as of {card.asOf}
        </p>
      )}

      {risky && (
        <p className="font-jetbrains mt-2 text-[10px] text-rose-300">
          load-bearing at low confidence — needs a second source before any script may state it
        </p>
      )}
      {wound && (
        <p
          className={`font-jetbrains mt-2 text-[10px] ${
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
      <span className="font-jetbrains rounded-full border border-white/10 px-2 py-0.5 text-[10px] tracking-[0.1em] text-white/30">
        locked in scope
      </span>
    );
  const label = card.optIn
    ? descoped ? "not taken" : "taken"
    : descoped ? "descoped" : "in scope";
  return (
    <span
      data-testid={`scope-state-${card.id}`}
      className={`font-jetbrains rounded-full border px-2 py-0.5 text-[10px] tracking-[0.1em] ${
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
  const toggle = () => !locked && api.toggle(card.id, "descoped");

  return (
    <li
      data-testid={`card-${card.id}`}
      data-descoped={s.descoped ? "true" : "false"}
      role={locked ? undefined : "button"}
      tabIndex={locked ? undefined : 0}
      aria-pressed={locked ? undefined : !s.descoped}
      aria-label={locked ? undefined : `${s.descoped ? "Include" : "Exclude"}: ${card.title}`}
      title={
        locked
          ? card.requiredWhy
          : card.optIn
            ? "Click to take this conclusion into the script. Conclusions are off by default."
            : "Click to descope. Reversible."
      }
      onClick={toggle}
      onKeyDown={(e) => {
        if (locked) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
      // Descoped is signalled by the BORDER, never by fading the text. Muting a
      // card is self-defeating on a surface whose whole job is deciding what
      // stays: you cannot judge what you cannot read, and the card you most need
      // to re-read is the one you just cut.
      className={`group rounded-xl border px-3.5 py-3 transition-colors duration-200 ease-linear focus-visible:outline-2 focus-visible:outline-offset-2 ${
        locked ? "" : "cursor-pointer"
      } ${
        s.descoped
          ? "border-amber-400/55 bg-amber-400/[0.03] hover:border-amber-400/80"
          : wound?.severity === "broken"
            ? "border-rose-400/30 bg-rose-400/[0.04] hover:border-rose-400/60"
            : wound
              ? "border-amber-400/25 bg-amber-400/[0.03] hover:border-amber-400/50"
              : "border-white/8 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]"
      }`}
    >
      <CardBody card={card} wound={wound} />

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <ScopeChip card={card} descoped={s.descoped} />
        {/* like / deepen keep their buttons and stop the click here — sweeping a
            column must never mark something "liked" by accident. */}
        <div onClick={(e) => e.stopPropagation()}>
          <CardActions card={card} api={api} compact />
        </div>
      </div>
    </li>
  );
}
