"use client";

// The rollup, and what the scope decisions actually cost.

import Notice from "../../_shared/ui/Notice";
import type { ScopeApi } from "../useScope";

export function ScopeBar({ api }: { api: ScopeApi }) {
  const s = api.summary;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <Stat label="in scope" value={`${s.kept}/${s.total}`} />
      {/* Cut and never-taken are two different facts about the board and only
          one of them is a decision. Folding them together lit this stat amber
          on arrival, because the conclusions start out of scope by design. */}
      <Stat label="descoped" value={s.descoped} tone={s.descoped ? "warn" : undefined} />
      {s.notTaken > 0 && <Stat label="not taken" value={s.notTaken} />}
      <Stat label="liked" value={s.liked} tone={s.liked ? "good" : undefined} />
      <Stat label="deepen" value={s.deepen} tone={s.deepen ? "info" : undefined} />
      <Stat
        label="wounded"
        value={s.wounds.length}
        tone={s.broken ? "bad" : s.wounds.length ? "warn" : undefined}
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "good" | "warn" | "bad" | "info" }) {
  const cls =
    tone === "bad" ? "text-rose-300" : tone === "warn" ? "text-amber-200" : tone === "good" ? "text-emerald-300" : tone === "info" ? "text-cyan-200" : "text-white/70";
  return (
    <span className="font-jetbrains text-label">
      <span className="tracking-[0.14em] text-white/30 uppercase">{label} </span>
      <span className={cls}>{value}</span>
    </span>
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
      <Notice severity="info" title={copy.title}>
        <p>Nothing downstream depends on them. The beat chain is intact.</p>
        {copy.alsoNotTaken && <p className="mt-1 text-white/50">{copy.alsoNotTaken}</p>}
      </Notice>
    );
  }
  return (
    <Notice
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
