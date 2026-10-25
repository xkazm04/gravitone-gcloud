// THE FLOOR COMPOSER (prototype index.html `IdeaComposer`, `Estimate`, floor.css
// `[data-component=IdeaComposer]`, `.comp-row`, `.comp-text`, `[data-component=Estimate]`,
// `.launch`): a lane's controls, the first sentence, the live estimate, and Launch.
//
// What the prototype did that is kept: the estimate re-reads on every change of the inputs and
// sits between the sentence and the button, so the price is in view at the moment of pressing;
// ⏎ in the sentence launches and ⇧⏎ is a newline (the keymap's `floor` ⏎ row is `field:
// "composer"`, so it fires inside this field and nowhere else).
//
// What changed (COMMON decision 3): Launch does not start anything. It opens the RECEIPT, and the
// receipt's confirm launches. The estimate is that same receipt's totals - computed by the
// server from the router and the queue - never a second sum drawn here, so the line above the
// button and the receipt behind it cannot disagree.
//
// The press is guarded synchronously (async-ui-states/action-busy-states: the disarm cannot ride
// a re-render): a second ⏎ while the receipt is being read is dropped by the caller's flag and
// the button reads busy.
import type { ReactNode } from "react";

import type { Receipt, ReceiptLine } from "@gt/domain/produce";

import { plural } from "../../count.ts";
import { FIELD_ATTR } from "../../keymap/target.ts";
import { cx } from "../cx.ts";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { Keycap } from "../keycaps/Keycaps.tsx";
import { SourceTag } from "../source/SourceTag.tsx";
import { costWords, fmtDur, totalPriced, unpricedKind } from "./produce.ts";
import { Unpriced } from "./Unpriced.tsx";
import s from "./Composer.module.css";

/** The composer's keyfield: the keymap's `floor` ⏎ launch row fires only inside it. */
export const COMPOSER_FIELD = "composer";

export type EstimateProps = {
  readonly receipt: Receipt | null;
  /** What one unit is called on this lane (`plate`, `clip`, `card`, `run`). */
  readonly noun: string;
  readonly error?: string;
};

/**
 * The receipt's totals as one line: units · ~time · cost (or `unpriced · <kind>`, its reason
 * behind a Hint) · queue #n · where the figures came from. While the first read
 * is in flight the line holds its place with dashes rather than collapsing (placeholder-design:
 * no jump when the figures land).
 */
export function Estimate({ receipt, noun, error }: EstimateProps) {
  if (error !== undefined) {
    return (
      <div className={s.estimate} data-component="Estimate">
        <ErrorLine message={error} />
      </div>
    );
  }
  if (receipt === null) {
    return (
      <div className={s.estimate} data-component="Estimate" aria-busy="true">
        <span>
          <b>—</b> {plural(2, noun)}
        </span>
        <span>
          ~<b>—</b>
        </span>
      </div>
    );
  }
  const t = receipt.totals;
  const units = receipt.lines.reduce((n, l) => n + l.units, 0);
  // One chip per unpriced KIND, each with its first line's reason: a seat line and a credits line
  // are two vendors billing two ways, and the first one found must not stand for both.
  const byKind = new Map<string, ReceiptLine>();
  for (const l of receipt.lines) if (l.usd === null && !byKind.has(unpricedKind(l.unpricedReason))) byKind.set(unpricedKind(l.unpricedReason), l);
  const unpriced = [...byKind.values()];
  const priced = totalPriced(receipt);
  return (
    <div className={s.estimate} data-component="Estimate" aria-live="polite">
      <span>
        <b>{units}</b> {plural(units, noun)}
      </span>
      <span>
        ~<b>{fmtDur(t.seconds)}</b>
      </span>
      {priced && (
        <span>
          <b>{costWords(t)}</b>
        </span>
      )}
      {unpriced.map((l) => (
        <Unpriced key={l.key} reason={l.unpricedReason} />
      ))}
      <span>
        queue <b>#{receipt.queuePos}</b>
      </span>
      <SourceTag kind={t.src} />
    </div>
  );
}

export type LaunchButtonProps = {
  readonly label: string;
  /** The figures after the label, in mono (`$47–92 · 2h 10m`). */
  readonly detail?: string;
  /** `row` sits at the foot of a composer; `plan` closes the plan's resource summary. */
  readonly size?: "row" | "plan";
  readonly busy?: boolean;
  readonly onPress: () => void;
  readonly shortcut: { readonly mode: string; readonly verb: string };
};

/** The launch control (floor.css `.launch`, projects.css `.launch-plan`): it opens a receipt. */
export function LaunchButton({ label, detail, size = "row", busy = false, onPress, shortcut }: LaunchButtonProps) {
  return (
    <button
      type="button"
      className={cx(s.launch, size === "plan" && s.plan, busy && s.busy)}
      aria-busy={busy ? true : undefined}
      aria-disabled={busy ? true : undefined}
      onClick={busy ? undefined : onPress}
    >
      <span>{label}</span>
      {detail !== undefined && <span className={s.detail}>{detail}</span>}
      <Keycap mode={shortcut.mode} verb={shortcut.verb} />
    </button>
  );
}

export type ComposerProps = {
  /** The form's accessible name (`Image idea`). */
  readonly name: string;
  readonly lane: string;
  /** The lane's own choices, one row (style + mechanism, topic, music/sfx, subject). */
  readonly controls: ReactNode;
  readonly text: string;
  readonly onText: (text: string) => void;
  /** An example first sentence, never an instruction. */
  readonly placeholder: string;
  readonly estimate: ReactNode;
  readonly onLaunch: () => void;
  readonly busy: boolean;
  /** The sentence field took focus: the Floor's ⏎ row now launches THIS lane. */
  readonly onFocus?: () => void;
};

export function Composer({ name, lane, controls, text, onText, placeholder, estimate, onLaunch, busy, onFocus }: ComposerProps) {
  return (
    // `data-composer`, not the prototype's `data-lane`: the Lane section that holds this form
    // carries `data-lane` with the same value, so `[data-lane="audio"]` named two elements of two
    // roles (the lane and its idea form) and a lane query matched the form as well (L47).
    <form className={s.composer} data-component="IdeaComposer" data-composer={lane} aria-label={name} onSubmit={(e) => e.preventDefault()}>
      <div className={s.row}>{controls}</div>
      <textarea
        className={s.text}
        rows={2}
        aria-label="first sentence"
        placeholder={placeholder}
        value={text}
        onChange={(e) => onText(e.currentTarget.value)}
        onFocus={onFocus}
        {...{ [FIELD_ATTR]: COMPOSER_FIELD }}
      />
      {estimate}
      <LaunchButton label="Launch" busy={busy} onPress={onLaunch} shortcut={{ mode: "floor", verb: "launch" }} />
    </form>
  );
}

/** The composer's row select, with groups (index.html `.comp-sel`: candidate · lock trial, proven · re-sweep). */
export type ComposerSelectProps = {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly groups: readonly { readonly label: string; readonly options: readonly { readonly value: string; readonly label: string }[] }[];
  /** Options after the groups, ungrouped (the forge's `Sweep · all N styles`). */
  readonly tail?: readonly { readonly value: string; readonly label: string }[];
};

export function ComposerSelect({ label, value, onChange, groups, tail = [] }: ComposerSelectProps) {
  return (
    <select className={s.sel} aria-label={label} value={value} onChange={(e) => onChange(e.currentTarget.value)}>
      {groups.map((g) =>
        g.label === "" ? (
          g.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))
        ) : (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ),
      )}
      {tail.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
