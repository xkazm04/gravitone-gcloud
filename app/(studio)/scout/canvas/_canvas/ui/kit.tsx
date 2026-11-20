"use client";

// THE CANVAS'S SMALL SHARED COMPONENTS - one per visual thing the winner drew as an HTML string in core.js: the glyph,
// the weir (a blocking point's pill), a chip, a state chip, the proportional stack bar, a keycap read off the keymap,
// and a one-of-n segment. Every surface uses these; none re-draws them.

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

import { KEYMAP } from "@gt/ui/keymap/bindings";

import { GLYPHS } from "../glyphs.ts";
import { BLOCK, STATE, type BlockKind, type GlyphName, type ItemState, type Tone } from "../tables.ts";
import k from "./kit.module.css";

export const cx = (...xs: readonly (string | false | null | undefined)[]): string => xs.filter(Boolean).join(" ");

export function Gl({ name, size = 14 }: { readonly name: GlyphName; readonly size?: number }) {
  const g = GLYPHS[name];
  return (
    <svg className={k.gl} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {g.s !== undefined && <path d={g.s} fill="none" stroke="currentColor" strokeWidth={g.w ?? 1.6} strokeLinejoin="round" strokeLinecap="round" />}
      {g.f !== undefined && <path d={g.f} fill="currentColor" />}
    </svg>
  );
}

/** A weir: what waits on the operator, as a count. Clicking it opens the surface that clears it. */
export function Weir({ kind, n, busy, word = true, ...rest }: { readonly kind: BlockKind; readonly n: number; readonly busy?: boolean; readonly word?: boolean } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button type="button" data-role="weir" data-block={kind} className={cx(k.pill, n === 0 && k.zero, busy === true && k.busy)} aria-label={`${n} ${BLOCK[kind].name}`} {...rest}>
      <Gl name={BLOCK[kind].glyph} />
      <b>{n}</b>
      {word && <span>{BLOCK[kind].name}</span>}
    </button>
  );
}

const TONE_CLASS: Partial<Record<Tone | "proj" | "planned", string | undefined>> = { amber: k.amber, cyan: k.cyan, emerald: k.emerald, rose: k.rose, violet: k.violet, faint: k.faint, proj: k.proj, planned: k.planned };

export function Chip({ children, tone, dot, title }: { readonly children: ReactNode; readonly tone?: Tone | "proj" | "planned"; readonly dot?: string; readonly title?: string }) {
  return (
    <span className={cx(k.chip, tone !== undefined && TONE_CLASS[tone])} title={title}>
      {dot !== undefined && <i style={{ background: dot }} />}
      {children}
    </span>
  );
}

export function StateChip({ state, n }: { readonly state: ItemState; readonly n?: number }) {
  const s = STATE[state];
  return <Chip tone={s.tone}>{(n !== undefined ? `${n} ` : "") + s.word}</Chip>;
}

/** One proportional rail. parts: [count, tone, alpha?]. */
export function StackBar({ parts, label }: { readonly parts: readonly (readonly [number, Tone, number?])[]; readonly label: string }) {
  const tot = parts.reduce((s, p) => s + p[0], 0) || 1;
  return (
    <span className={k.stackbar} role="img" aria-label={label}>
      {parts.filter((p) => p[0] > 0).map((p, i) => (
        <span key={i} style={{ flex: p[0] / tot, background: `var(--${p[1]})`, opacity: p[2] ?? 1 } satisfies CSSProperties} />
      ))}
    </span>
  );
}

/** The first cap the keymap binds to `verb` in `mode`, as the winner drew it. */
export function capOf(mode: string, verb: string): string {
  const row = KEYMAP.rows.find((r) => r.binding.mode === mode && r.binding.verb === verb);
  return row?.binding.keys[0] ?? "";
}

export function Kbd({ mode = "canvas", verb, cap }: { readonly mode?: string; readonly verb?: string; readonly cap?: string }) {
  const c = cap ?? (verb === undefined ? "" : capOf(mode, verb));
  return c === "" ? null : <kbd className={k.kbd}>{c}</kbd>;
}

export function Seg<T extends string>({ label, value, options, onPick, disabled }: { readonly label: string; readonly value: T | null; readonly options: readonly { readonly key: T; readonly name?: string; readonly title?: string }[]; readonly onPick: (v: T) => void; readonly disabled?: boolean }) {
  return (
    <div className={k.seg} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" className={cx(value === o.key && k.on)} aria-pressed={value === o.key} title={o.title} disabled={disabled} onClick={() => onPick(o.key)}>
          {o.name ?? o.key}
        </button>
      ))}
    </div>
  );
}

export { k as kit };
