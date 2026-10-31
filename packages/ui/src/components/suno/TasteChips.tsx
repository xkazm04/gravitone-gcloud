"use client";

// The person's taste, one line per row (spark suno-advisor): lines the agent PROPOSED from their
// verdicts (keep / remove) and lines already KEPT (remove). Only a kept line persists across sessions
// and seeds the next prompt, so a proposal never counts until it is kept. Each row holds its own press:
// pending while the write is on its way, and the refusal verbatim under it when it did not go.
// A proposal whose line is already kept (any case) shows once, as kept.
import { useState } from "react";

import type { StudioTasteLine, TasteLean } from "@gt/domain/audio.suno";

import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { CapsHeading } from "../heading/CapsHeading.tsx";
import s from "./TasteChips.module.css";

export type TasteRow = { readonly id: string; readonly line: string; readonly lean: TasteLean };

/** A row's press between the click and the write's answer. */
export type TastePress = { readonly kind: "pending" } | { readonly kind: "refused"; readonly reason: string };

export type TasteChipsProps = {
  /** The taste node's rows (proposals); empty when the turn proposes none. */
  readonly proposed: readonly TasteRow[];
  /** The confirmed profile. */
  readonly kept: readonly StudioTasteLine[];
  /** Resolve with the refusal in words, or null when it went. */
  readonly onKeep: (row: { readonly line: string; readonly lean: TasteLean }) => Promise<string | null>;
  readonly onDrop: (line: string) => Promise<string | null>;
  /** /kit only: rows drawn mid-press, by line. */
  readonly seed?: Readonly<Record<string, TastePress>>;
};

const LEAN = { like: { tone: "emerald", mark: "+" }, dislike: { tone: "rose", mark: "−" } } as const;
const norm = (line: string): string => line.trim().toLowerCase();
const without = (p: Readonly<Record<string, TastePress>>, key: string): Record<string, TastePress> => Object.fromEntries(Object.entries(p).filter(([k]) => k !== key));

type Act = { readonly label: string; readonly tone?: "emerald" | "rose"; readonly run: () => void };

function Row({ line, lean, press, acts }: { readonly line: string; readonly lean: TasteLean; readonly press: TastePress | undefined; readonly acts: readonly Act[] }) {
  const pending = press?.kind === "pending";
  return (
    <li className={s.row} data-pending={pending || undefined}>
      <Chip label={`${LEAN[lean].mark} ${lean}`} tone={LEAN[lean].tone} casing="lower" />
      <span className={s.line}>{line}</span>
      <span className={s.acts} role="group" aria-label={line}>
        {acts.map((a) => (
          <Button key={a.label} label={pending ? `${a.label}…` : a.label} size="sm" {...(a.tone !== undefined ? { tone: a.tone } : {})} disabled={pending} onPress={a.run} />
        ))}
      </span>
      {press?.kind === "refused" && (
        <span className={s.refused}>
          <ErrorLine message={press.reason} live />
        </span>
      )}
    </li>
  );
}

export function TasteChips({ proposed, kept, onKeep, onDrop, seed = {} }: TasteChipsProps) {
  const [press, setPress] = useState<Readonly<Record<string, TastePress>>>(() => Object.fromEntries(Object.entries(seed).map(([k, v]) => [norm(k), v])));
  const run = (key: string, act: () => Promise<string | null>): void => {
    if (press[key]?.kind === "pending") return;
    setPress((p) => ({ ...p, [key]: { kind: "pending" } }));
    void act().then((reason) => setPress((p) => (reason === null ? without(p, key) : { ...without(p, key), [key]: { kind: "refused", reason } })));
  };
  const keptLines = new Set(kept.map((k) => norm(k.line)));
  const open = proposed.filter((r) => !keptLines.has(norm(r.line)));
  if (open.length === 0 && kept.length === 0) return null;
  return (
    <div className={s.taste}>
      {open.length > 0 && (
        <section className={s.group} aria-label="proposed taste">
          <CapsHeading text="proposed" tally={{ value: open.length }} level={4} />
          <ul className={s.rows}>
            {open.map((r) => (
              <Row
                key={r.id}
                line={r.line}
                lean={r.lean}
                press={press[norm(r.line)]}
                acts={[
                  { label: "keep", tone: "emerald", run: () => run(norm(r.line), () => onKeep({ line: r.line, lean: r.lean })) },
                  { label: "remove", run: () => run(norm(r.line), () => onDrop(r.line)) },
                ]}
              />
            ))}
          </ul>
        </section>
      )}
      {kept.length > 0 && (
        <section className={s.group} aria-label="kept taste">
          <CapsHeading text="kept" tally={{ value: kept.length }} level={4} />
          <ul className={s.rows}>
            {kept.map((k) => (
              <Row key={norm(k.line)} line={k.line} lean={k.lean} press={press[norm(k.line)]} acts={[{ label: "remove", tone: "rose", run: () => run(norm(k.line), () => onDrop(k.line)) }]} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
