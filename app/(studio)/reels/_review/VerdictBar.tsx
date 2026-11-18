"use client";

// THE STOP'S VERDICT. The film stop answers take, redo or drop; the release stop keep or reject. Reasons are the
// reel source's words (chips), the box holds words; P (or the pin button) stamps the drafted reasons and words at
// the playhead as a note and clears the draft, so a redo can carry a dozen moments. A redo owes a reason or a note
// pinned to the film; a release reject owes a reason. Drop is the one answer that cannot be walked back, so it asks
// twice and says what it does. A verdict is OF the subject sha the page read: no sha, no verdict.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ReelPin } from "@/lib/reel/store";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { mss } from "@gt/ui/components/filmstrip/Filmstrip.tsx";
import { TextArea } from "@gt/ui/components/field/Field.tsx";

import { MAX_REASONS } from "../_port/reasons.ts";
import { pinnable } from "./pins.ts";
import type { ReviewActions } from "./props.ts";
import r from "./review.module.css";

export type Draft = { readonly reasons: readonly string[]; readonly text: string };

type Answer = "keep" | "reject" | "drop";

const WORDS: Readonly<Record<"film" | "release", readonly (readonly [Answer, string, "emerald" | "rose" | "neutral"])[]>> = {
  film: [
    ["keep", "take", "emerald"],
    ["reject", "redo", "rose"],
    ["drop", "drop", "neutral"],
  ],
  release: [
    ["keep", "keep → calendar", "emerald"],
    ["reject", "reject", "rose"],
  ],
};

export function VerdictBar(p: {
  readonly slug: string;
  readonly stop: "film" | "release";
  readonly of: string | undefined;
  readonly reasons: readonly string[];
  readonly draft: Draft;
  readonly onDraft: (d: Draft) => void;
  readonly pins: readonly ReelPin[];
  readonly onPin: () => boolean;
  readonly onUnpin: (pin: ReelPin) => void;
  readonly onSeek: (t: number) => void;
  readonly actions: ReviewActions;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [armed, setArmed] = useState(false);
  const { draft, onDraft } = p;

  const toggle = (word: string) => {
    const on = draft.reasons.includes(word);
    if (!on && draft.reasons.length >= MAX_REASONS) return;
    onDraft({ ...draft, reasons: on ? draft.reasons.filter((x) => x !== word) : [...draft.reasons, word] });
  };

  const owes = (a: Answer): string | undefined => {
    if (p.of === undefined) return "no film sha to judge yet";
    if (a === "reject" && p.stop === "film" && draft.reasons.length === 0 && p.pins.length === 0) return "a redo needs a reason or a pinned note";
    if (a === "reject" && p.stop === "release" && draft.reasons.length === 0) return "a reject needs a reason";
    return undefined;
  };

  const send = (a: Answer) => {
    const why = owes(a);
    if (why !== undefined || p.of === undefined) {
      setError(why);
      return;
    }
    if (a === "drop" && !armed) {
      setArmed(true);
      return;
    }
    const note = draft.text.trim();
    const of = p.of;
    setError(undefined);
    start(async () => {
      const res = await p.actions.decide({ slug: p.slug, key: p.stop, verdict: a, reasons: draft.reasons, of, ...(note === "" ? {} : { note }), ...(p.stop === "film" && p.pins.length > 0 ? { pins: p.pins } : {}) });
      if (!res.ok) {
        setError(res.error.error);
        setArmed(false);
        return;
      }
      router.refresh();
    });
  };

  return (
    <section className={r.bar} aria-label={`${p.stop} verdict`}>
      <div className={r.reasons} role="group" aria-label="reasons">
        {p.reasons.map((w) => (
          <Chip key={w} label={w} casing="lower" tone={draft.reasons.includes(w) ? "amber" : "neutral"} pressed={draft.reasons.includes(w)} onPress={() => toggle(w)} />
        ))}
      </div>
      <div className={r.draft}>
        <TextArea label={p.stop === "film" ? "note" : "release note"} value={draft.text} onChange={(text) => onDraft({ ...draft, text })} rows={2} maxLength={2000} />
        {p.stop === "film" && <Button label="pin at playhead" size="sm" tone="amber" shortcut={{ mode: "reel", verb: "pin" }} disabled={!pinnable(draft.reasons, draft.text)} onPress={() => void p.onPin()} />}
      </div>
      {p.pins.length > 0 && (
        <ol className={r.pins} aria-label="pinned notes">
          {p.pins.map((pin) => (
            <li key={`${pin.t}:${pin.text}:${pin.reasons.join()}`} className={r.pin}>
              <button type="button" className={r.pinAt} onClick={() => p.onSeek(pin.t)} aria-label={`seek ${mss(pin.t)}`}>
                {mss(pin.t)}
              </button>
              {pin.reasons.map((w) => (
                <Chip key={w} label={w} casing="lower" tone="amber" ghost />
              ))}
              {pin.text !== "" && <span className={r.pinText}>{pin.text}</span>}
              <button type="button" className={r.unpin} onClick={() => p.onUnpin(pin)} aria-label={`remove note at ${mss(pin.t)}`}>
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className={r.answers}>
        {WORDS[p.stop].map(([a, label, tone]) => (
          <Button key={a} label={a === "drop" && armed ? "drop this reel for good" : label} tone={a === "drop" && armed ? "rose" : tone} solid={a === "keep"} pending={pending} disabled={p.of === undefined} onPress={() => send(a)} />
        ))}
        {armed && <Button label="keep it" size="sm" onPress={() => setArmed(false)} />}
      </div>
      {error !== undefined && <ErrorLine message={error} live />}
    </section>
  );
}
