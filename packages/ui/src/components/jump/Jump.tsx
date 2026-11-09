"use client";

// JUMP - one field over the whole studio: a section, a project or a record's id, and ⏎ goes there
// (spark fable-ten, package C; keyboard-shortcuts layered-key-dispatch: the global layer's
// "go to a section"). The shell decides what the rows are (app/(studio)/_shell/jump/resolve.ts);
// this draws them and moves among them.
//
// A `dialog` layer in the keymap mode `jump`: while it is up the screen beneath hears nothing,
// Escape is the layer router's, and focus goes back where it was (useLayer). The rows are LINKS
// with real hrefs - a middle click opens a tab - and a plain click or ⏎ on a focused row is
// routed by the shell (`onGo`), a soft navigation. Focus moves into the rows (↓ from the field),
// not an active-descendant over them: Field is the studio's only text control and carries no
// combobox wiring, and a focused link is announced as what it is.
//
// The field's placeholder is an example of the work (Library `title · topic · script`), never an
// instruction; a row is a name and what kind of place it is.
import { useEffect, useRef } from "react";

import { useKeys } from "../../keymap/dispatch.ts";
import { useLayer } from "../../layers/useLayer.ts";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { Field } from "../field/Field.tsx";
import { Ghost } from "../ghost/Ghost.tsx";
import { plainClick } from "../link/plain.ts";
import { cx } from "../cx.ts";
import s from "./Jump.module.css";

export type JumpRow = {
  readonly key: string;
  readonly label: string;
  /** What kind of place: `section`, `project`, `board`, `runs`, `ledger`. */
  readonly kind: string;
  readonly href: string;
};

export type JumpDialogProps = {
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly rows: readonly JumpRow[];
  readonly onGo: (row: JumpRow) => void;
  readonly onClose: () => void;
  readonly placeholder: string;
  /** A source still loading (the projects): one ghost row holds its place. */
  readonly pending?: string | undefined;
  /** A source that failed to load, verbatim. */
  readonly error?: string | undefined;
  /** A /kit specimen: drawn in flow, never on the stack, no keys. */
  readonly specimen?: boolean;
};

const rowLinks = (list: HTMLElement | null): HTMLAnchorElement[] => (list === null ? [] : [...list.querySelectorAll<HTMLAnchorElement>("a[data-jump-row]")]);

export function JumpDialog({ query, onQuery, rows, onGo, onClose, placeholder, pending, error, specimen = false }: JumpDialogProps) {
  const panel = useRef<HTMLDivElement | null>(null);
  const list = useRef<HTMLUListElement | null>(null);
  useLayer(!specimen, { kind: "dialog", mode: "jump", panelRef: panel, onClose });

  const field = (): HTMLInputElement | null => panel.current?.querySelector("input") ?? null;
  // Focus enters the field once, on open, so the first keystroke is the query.
  useEffect(() => {
    if (!specimen) field()?.focus({ preventScroll: true });
  }, [specimen]);

  const focusRow = (i: number): void => {
    const links = rowLinks(list.current);
    if (links.length === 0) return;
    links[Math.max(0, Math.min(links.length - 1, i))]?.focus();
  };
  const at = (): number => rowLinks(list.current).findIndex((a) => a === document.activeElement);

  useKeys(
    "jump",
    {
      // ↑ from the first row goes back to the field; ↓ walks, stopping at the last.
      move: ({ index }) => {
        const i = at();
        if (i < 0) return false;
        if (index === 0 && i === 0) field()?.focus();
        else focusRow(index === 0 ? i - 1 : i + 1);
        return undefined;
      },
      edge: ({ index }) => {
        if (at() < 0) return false;
        focusRow(index === 0 ? 0 : Number.MAX_SAFE_INTEGER);
        return undefined;
      },
      go: () => {
        const first = rows[0];
        if (first === undefined) return false;
        onGo(first);
        return undefined;
      },
      "to-rows": () => {
        if (rows.length === 0) return false;
        focusRow(0);
        return undefined;
      },
    },
    { enabled: !specimen },
  );

  return (
    <div className={cx(s.backdrop, specimen && s.inline)}>
      <div ref={panel} className={s.panel} role="dialog" aria-modal={specimen ? undefined : true} aria-label="jump">
        <Field label="jump to" value={query} onChange={onQuery} placeholder={placeholder} keyfield="jump" />
        <ul ref={list} className={s.rows} aria-label="destinations">
          {rows.map((r, i) => (
            <li key={r.key}>
              <a
                className={cx(s.row, i === 0 && s.first)}
                href={r.href}
                data-jump-row=""
                onClick={(e) => {
                  if (!plainClick(e)) return;
                  e.preventDefault();
                  onGo(r);
                }}
              >
                <span className={s.label}>{r.label}</span>
                <span className={s.kind}>{r.kind}</span>
              </a>
            </li>
          ))}
        </ul>
        {pending !== undefined && <Ghost label={pending} />}
        {error !== undefined && <ErrorLine message={error} />}
      </div>
    </div>
  );
}
