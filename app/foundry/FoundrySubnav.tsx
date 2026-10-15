"use client";

// THE FOUNDRY'S SUBMENU — the app header's own row, one level down.
//
// The stations used to be glass cards with figures and a picture tray, then one
// row of glass cards with two figures each, and both ate the top of a page whose
// whole point is the board below. The operator's answer was to stop inventing a
// shape for them: the app header (components/ui/StudioFrame.tsx) already draws
// "which of these places am I in" as plain labels with a cyan rule under the
// current one, and these six are the same kind of thing one level down. So this
// row is that row's styling, deliberately — same size, same weights, same
// underline — and it reads as a submenu because it is directly beneath it.
//
// WHAT WAS DROPPED, so it is a decision and not a loss: the per-station figures
// ("3 runs · 1 to cull"). A submenu is a place-marker, and each station's own
// panel opens on those numbers anyway. What survives is the STATUS DOT, because
// "something over there wants you" is the one fact you cannot get without
// leaving where you are.
//
// FOUR STATIONS ARE DOORS NOW (Phase 3): the cull, Extract, the Dojo and Strips
// decide on the Board, so each is drawn as a link to the lane where its piles
// wait, keeping its status dot - "something over there wants you" is still the
// one fact this row exists to carry.
//
// THE MEDIA SWITCH RIDES HERE TOO, and only while the Pipeline is open. It is
// the same kind of choice as the station — which body of work am I looking at —
// so it belongs in the same row rather than in a bar of its own above the board,
// which is the row this change deletes. It sits after a divider so it reads as
// a second group and not a seventh station.

import type { Station, Tab } from "./plant";
import { DECIDED_ON, ENGINE, type EngineLine } from "./plant";
import { Dot } from "./ui";

export interface SubnavMedia<T extends string> {
  value: T;
  options: ReadonlyArray<{ id: T; label: string }>;
  onChange: (id: T) => void;
}

/** Roving arrows for a hand-built tablist: the same manual-activation rule
 *  TabRail keeps (components/ui/signal/TabRail.tsx) — arrows move focus,
 *  Enter/Space select. */
function tabKeys(e: React.KeyboardEvent<HTMLElement>) {
  const list = e.currentTarget.closest('[role="tablist"]');
  if (!list) return;
  const tabs = Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]'));
  const i = tabs.indexOf(e.currentTarget);
  const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
  if (to === null) return;
  e.preventDefault();
  tabs[(to + tabs.length) % tabs.length]?.focus();
}

/** One entry, in the header's idiom: a label, white when current, with a rule
 *  under it. The rule is the second channel — the repo's law forbids colour
 *  alone carrying a state, and white-vs-white/70 is one channel in one. */
function Entry({
  on,
  label,
  onPick,
  testId,
  role,
  children,
}: {
  on: boolean;
  label: string;
  onPick: () => void;
  testId?: string;
  role: "tab" | "radio";
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role={role}
      {...(role === "tab" ? { "aria-selected": on, tabIndex: on ? 0 : -1 } : { "aria-checked": on })}
      data-testid={testId}
      onClick={onPick}
      onKeyDown={role === "tab" ? tabKeys : undefined}
      className={`relative cursor-pointer whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-offset-4 ${
        on ? "text-white" : "text-white/70 hover:text-white"
      }`}
    >
      <span className="flex items-center gap-2">
        {children}
        {label}
      </span>
      {on && <span aria-hidden className="absolute -bottom-1.5 left-0 h-px w-full bg-cyan-400/70" />}
    </button>
  );
}

export default function FoundrySubnav<T extends string>({
  tab,
  onSelect,
  lines,
  media,
}: {
  tab: Tab;
  onSelect: (t: Tab) => void;
  /** Each station's one live fact, or null where it has none. */
  lines: Partial<Record<Station, EngineLine | null>>;
  /** Rendered only when the station that owns it is open. */
  media?: SubnavMedia<T>;
}) {
  const tabs: readonly Tab[] = ["styles", "pipeline"];
  const doors = Object.keys(DECIDED_ON) as Exclude<Station, Tab>[];
  return (
    <div className="font-jetbrains flex w-full items-center gap-6 overflow-x-auto pb-1.5 text-label whitespace-nowrap md:gap-7">
      <div role="tablist" aria-label="foundry stations" className="flex items-center gap-6 md:gap-7">
        {tabs.map((t) => {
          const l = lines[t] ?? null;
          return (
            <Entry key={t} role="tab" on={t === tab} label={ENGINE[t].name} onPick={() => onSelect(t)} testId={`foundry-tab-${t}`}>
              {l && <Dot tone={l.tone} pulse={l.pulse} />}
            </Entry>
          );
        })}
      </div>
      <nav aria-label="decided on the Board" className="flex items-center gap-6 md:gap-7">
        {doors.map((d) => {
          const l = lines[d] ?? null;
          return (
            <a key={d} href={DECIDED_ON[d]} data-testid={`foundry-door-${d}`} className="flex items-center gap-2 whitespace-nowrap text-white/70 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4">
              {l && <Dot tone={l.tone} pulse={l.pulse} />}
              {ENGINE[d].name} ›
            </a>
          );
        })}
      </nav>
      {media && (
        <>
          <span aria-hidden className="h-4 w-px shrink-0 bg-white/12" />
          <div role="radiogroup" aria-label="media" className="flex items-center gap-5">
            {media.options.map((o) => (
              <Entry key={o.id} role="radio" on={o.id === media.value} label={o.label} onPick={() => media.onChange(o.id)} testId={`pipeline-media-${o.id}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
