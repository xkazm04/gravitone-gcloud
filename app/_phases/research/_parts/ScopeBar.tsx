"use client";

// The rollup, and what the scope decisions actually cost.

import { StaleBadge } from "@/components/ui/signal";

import Notice from "../../_shared/ui/Notice";
import type { ScopeApi } from "../useScope";

/** THE CROSS-CUTTING STATES A BOARD CAN BE FILTERED BY. Each is a count the
 *  ScopeBar already draws; the filter is how that number becomes a way into the
 *  cards it counts. */
export type StateFilter = "descoped" | "liked" | "deepen" | "wounded";

/** `trouble`: why the project's saved notebook is not the one dealt
 *  (`useActiveNotebook().trouble`); the board is the replay then.
 *
 *  `stateFilter` / `onStateFilter` make the four state counts into toggles. Both
 *  are optional: a surface that passes neither (the guided review) keeps plain
 *  numbers. A count of 0 is never a toggle — there is nothing behind it, unless
 *  it is the filter already applied, which must stay clickable to be cleared. */
export function ScopeBar({
  api,
  trouble,
  stateFilter = null,
  onStateFilter,
}: {
  api: ScopeApi;
  trouble?: string | null;
  stateFilter?: StateFilter | null;
  onStateFilter?: (next: StateFilter | null) => void;
}) {
  const pick = (f: StateFilter) =>
    onStateFilter
      ? { pressed: stateFilter === f, onToggle: () => onStateFilter(stateFilter === f ? null : f) }
      : undefined;
  const s = api.summary;
  const orphan = api.orphaned;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {/* A SCOPE DECIDED ON ANOTHER NOTEBOOK (useScope's digest rule). Its
          verdicts are not applied — every count beside it is this notebook's
          defaults — and the badge is what says the decisions exist. */}
      {trouble && (
        <span data-testid="notebook-refused">
          <StaleBadge glyph="history" words="notebook not dealt" why={`${trouble} — the stand-in is dealt instead`} />
        </span>
      )}
      {orphan && (
        <span data-testid="scope-orphaned">
          <StaleBadge
            glyph="history"
            words="scope orphaned"
            why={
              orphan.decisions > 0
                ? `${orphan.decisions} card decision${orphan.decisions === 1 ? "" : "s"} made on another notebook — none applied`
                : "confirmed on another notebook — not applied"
            }
          />
        </span>
      )}
      <Stat label="in scope" value={`${s.kept}/${s.total}`} />
      {/* Cut and never-taken are two different facts about the board and only
          one of them is a decision. Folding them together lit this stat amber
          on arrival, because the conclusions start out of scope by design. */}
      <Stat label="descoped" value={s.descoped} tone={s.descoped ? "warn" : undefined} toggle={pick("descoped")} />
      {s.notTaken > 0 && <Stat label="not taken" value={s.notTaken} />}
      <Stat label="liked" value={s.liked} tone={s.liked ? "good" : undefined} toggle={pick("liked")} />
      <Stat label="deepen" value={s.deepen} tone={s.deepen ? "info" : undefined} toggle={pick("deepen")} />
      <Stat
        label="wounded"
        value={s.wounds.length}
        tone={s.broken ? "bad" : s.wounds.length ? "warn" : undefined}
        toggle={pick("wounded")}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  toggle,
}: {
  label: string;
  value: string | number;
  tone?: "good" | "warn" | "bad" | "info";
  toggle?: { pressed: boolean; onToggle: () => void };
}) {
  const cls =
    tone === "bad" ? "text-rose-300" : tone === "warn" ? "text-amber-200" : tone === "good" ? "text-emerald-300" : tone === "info" ? "text-cyan-200" : "text-white/70";
  const body = (
    <>
      <span className="tracking-[0.14em] text-white/30 uppercase">{label} </span>
      <span className={cls}>{value}</span>
    </>
  );
  if (!toggle) return <span className="font-jetbrains text-label">{body}</span>;
  // Nothing behind a zero, so it is not offered — unless it is the applied
  // filter, which has to stay reachable to be taken off.
  const empty = value === 0 || value === "0";
  return (
    <button
      type="button"
      data-testid={`scope-filter-${label}`}
      onClick={toggle.onToggle}
      aria-pressed={toggle.pressed}
      disabled={empty && !toggle.pressed}
      className={`font-jetbrains text-label rounded-full border px-2 py-0.5 transition disabled:cursor-default ${
        toggle.pressed
          ? "border-cyan-400/40 bg-cyan-400/10"
          : "border-transparent enabled:hover:border-white/15 enabled:hover:bg-white/[0.04]"
      }`}
    >
      {body}
    </button>
  );
}

/** THE WORDS FOR A BOARD WITH CUTS AND NO WOUNDS — pure, so the probe drives
 *  the real copy rather than a second copy of it.
 *
 *  The notice used to be titled `${s.descoped} cards out of scope`, and
 *  `descoped` is precisely the count that EXCLUDES the opt-in conclusions
 *  nobody has taken. Measured on the shipped notebook: 7 of 36 cards are
 *  opt-in, so with one card cut the panel announced "1 card out of scope"
 *  while 8 were — understating by 7 in every reachable case, on the one
 *  surface whose subject is what the script will not see.
 *
 *  scope.ts split those two counts on purpose and says why: cut is a decision,
 *  not-taken is the default state, and folding them together lights an alarm on
 *  arrival. So the fix is not to swap in `outOfScope` and re-light it — it is to
 *  title the alarm with the DECISION and let the body carry the rest. The branch
 *  directly above this one already did exactly that; this one had not been
 *  brought along. */
export function cutCopy(s: ScopeApi["summary"]): { title: string; alsoNotTaken: string | null } {
  return {
    title: `${s.descoped} card${s.descoped === 1 ? "" : "s"} cut`,
    alsoNotTaken:
      s.notTaken > 0
        ? `${s.outOfScope} of ${s.total} cards are out of scope in total — these ${s.descoped}, plus the ${s.notTaken} conclusion${s.notTaken === 1 ? "" : "s"} you have not taken.`
        : null,
  };
}

/** The consequences panel. A scope decision that quietly disarms a turn three
 *  beats away is the exact failure this step exists to prevent, so the
 *  arithmetic is stated rather than left to be noticed. */
export function Consequences({ api }: { api: ScopeApi }) {
  const s = api.summary;
  const byId = new Map(api.cards.map((c) => [c.id, c]));

  if (s.blocked) {
    return (
      <Notice severity="error" title="scope cannot be confirmed">
        {s.requiredGone.map((c) => (
          <p key={c.id}>{c.requiredWhy}</p>
        ))}
      </Notice>
    );
  }
  // NOTHING CUT, NOTHING WOUNDED — and so nothing to report. This branch used
  // to print "Nothing descoped. The script will be written against the full
  // notebook, minus the N conclusions you have not taken." Both halves are
  // already on the ScopeBar directly above it, as `DESCOPED 0` and `NOT TAKEN
  // N`, which is where a reader checks a count. A panel that renders a sentence
  // in the state where nothing has happened is a panel that is ignored in the
  // state where something has.
  if (!s.wounds.length && !s.descoped) return null;
  if (!s.wounds.length) {
    const copy = cutCopy(s);
    return (
      <Notice announce severity="info" title={copy.title}>
        <p>Nothing downstream depends on them. The beat chain is intact.</p>
        {copy.alsoNotTaken && <p className="mt-1 text-white/50">{copy.alsoNotTaken}</p>}
      </Notice>
    );
  }
  return (
    <Notice
      announce
      severity={s.broken ? "error" : "warning"}
      title={s.broken ? `${s.broken} turn${s.broken === 1 ? "" : "s"} cannot be argued` : `${s.wounds.length} weakened`}
    >
      <ul className="space-y-1">
        {s.wounds.map((w) => (
          <li key={w.cardId} className="text-label">
            <span className="font-jetbrains text-label text-white/45">{w.cardId}</span>{" "}
            {byId.get(w.cardId)?.title}
            <span className="text-white/45"> — lost {w.missing.join(", ")}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-content text-white/50">
        {s.broken
          ? "A reversal with no surviving evidence is an assertion. Either restore a card or accept that the script loses that turn."
          : "These still stand, on less. The script may state them more cautiously than the notebook does."}
      </p>
    </Notice>
  );
}
