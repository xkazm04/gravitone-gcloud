"use client";

// THE INPUT A SOURCE VERB ASKS FOR, before the source is asked to run it.
//
// Two forms, named by the verb (`BoardVerb.input.kind`, lib/board/pipeline.ts):
//
//   suno-fields  the four fields a Suno prompt IS - title, style, lyrics,
//                exclude. Style is the only one Suno refuses to go without, so
//                it is the only required one. "Instrumental" is not a fifth
//                field: it is the lyrics `[Instrumental]`, which is how the
//                contract spells it (lib/suno/types.ts), so the toggle writes
//                that and locks the lyrics field rather than carrying a flag the
//                source would have to translate back.
//   count        a small integer, 1-8, as a stepper - a number field would take
//                "40" from a stray keystroke for a verb that drafts with an LLM.
//
// ABSENT FIELDS ARE OMITTED, never sent as "". The contract's convention is that
// an optional key is left out, and an empty title sent as "" is a title the
// source has to decide is not one.
//
// A REFUSAL STAYS IN THE DIALOG. `aria-modal` has removed the board from the
// accessibility tree, so a reason drawn anywhere else would reach nobody; the
// dialog closes only on `ok`, and the engine has already said the answer and
// re-read the board by then (../useBoardVerbs.ts `perform`).

import { useId, useState } from "react";

import { Minus, Plus } from "lucide-react";

import { Field, TextArea, TextInput } from "@/components/ui/Field";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Primitives";
import type { BoardVerb, VerbInput, VerbResult } from "@/lib/board/pipeline";

import { Label } from "../../ui";
import { TYPE } from "../type";
import { Failure } from "./write";

/** The lyrics that mean "no vocals" (lib/suno/types.ts SunoFields). */
const INSTRUMENTAL = "[Instrumental]";
const COUNT_MIN = 1;
const COUNT_MAX = 8;

type Phase = { kind: "idle" } | { kind: "busy" } | { kind: "failed"; reason: string };

export function VerbAsk({
  verb,
  where,
  run,
  onClose,
}: {
  verb: BoardVerb;
  /** The place or card the verb was asked on — the dialog's eyebrow. */
  where: string;
  run(input: VerbInput): Promise<VerbResult>;
  onClose(): void;
}) {
  const kind = verb.input?.kind ?? "count";
  const initial = verb.input?.initial;
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = phase.kind === "busy";

  const seed = initial?.kind === "suno-fields" ? initial : null;
  const [title, setTitle] = useState(seed?.title ?? "");
  const [style, setStyle] = useState(seed?.style ?? "");
  const [lyrics, setLyrics] = useState(seed?.lyrics === INSTRUMENTAL ? "" : (seed?.lyrics ?? ""));
  const [instrumental, setInstrumental] = useState(seed?.lyrics === INSTRUMENTAL);
  const [exclude, setExclude] = useState(seed?.exclude ?? "");
  const [count, setCount] = useState(() => clamp(initial?.kind === "count" ? initial.count : 4));

  const valid = kind === "count" || style.trim().length > 0;

  const input = (): VerbInput => {
    if (kind === "count") return { kind: "count", count };
    const t = title.trim();
    const l = instrumental ? INSTRUMENTAL : lyrics.trim();
    const x = exclude.trim();
    return { kind: "suno-fields", style: style.trim(), ...(t ? { title: t } : {}), ...(l ? { lyrics: l } : {}), ...(x ? { exclude: x } : {}) };
  };

  const submit = async () => {
    if (!valid || busy) return;
    setPhase({ kind: "busy" });
    const r = await run(input());
    if (r.ok) onClose();
    else setPhase({ kind: "failed", reason: r.reason });
  };

  const close = () => {
    if (!busy) onClose();
  };

  const titleId = useId();
  const styleId = useId();
  const lyricsId = useId();
  const excludeId = useId();
  const ids = { title: titleId, style: styleId, lyrics: lyricsId, exclude: excludeId };

  return (
    <Modal
      open
      onClose={close}
      title={verb.label.replace(/…$/, "")}
      eyebrow={<Label>{where}</Label>}
      className="max-w-xl"
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={busy || !valid} aria-busy={busy} data-testid="pipeline-verb-submit">
            {busy ? "sending…" : phase.kind === "failed" ? "Retry" : "Confirm"}
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {kind === "suno-fields" ? (
          <>
            <Field label="Title" htmlFor={ids.title}>
              <TextInput id={ids.title} value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} data-testid="pipeline-verb-title" />
            </Field>
            <Field label="Style" htmlFor={ids.style}>
              <TextArea
                id={ids.style}
                autoFocus
                required
                aria-required
                rows={3}
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                disabled={busy}
                data-testid="pipeline-verb-style"
              />
            </Field>
            <Field label="Lyrics" htmlFor={ids.lyrics}>
              <TextArea
                id={ids.lyrics}
                rows={5}
                value={instrumental ? INSTRUMENTAL : lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                disabled={busy || instrumental}
                data-testid="pipeline-verb-lyrics"
              />
            </Field>
            <button
              type="button"
              aria-pressed={instrumental}
              onClick={() => setInstrumental((v) => !v)}
              disabled={busy}
              data-testid="pipeline-verb-instrumental"
              className={`flex h-8 w-max cursor-pointer items-center gap-2 rounded-full border px-3 transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
                instrumental ? "border-cyan-300/60 bg-cyan-300/10 text-cyan-100" : "border-white/15 text-white/70 hover:border-white/30"
              }`}
            >
              <span aria-hidden className={`h-2 w-2 rounded-full ${instrumental ? "bg-cyan-300" : "bg-white/25"}`} />
              <span className={TYPE.label}>instrumental</span>
            </button>
            <Field label="Exclude" htmlFor={ids.exclude}>
              <TextInput id={ids.exclude} value={exclude} onChange={(e) => setExclude(e.target.value)} disabled={busy} data-testid="pipeline-verb-exclude" />
            </Field>
          </>
        ) : (
          <Field label="Count">
            <div className="flex items-center gap-3">
              <StepButton label="One fewer" disabled={busy || count <= COUNT_MIN} onClick={() => setCount((n) => clamp(n - 1))}>
                <Minus aria-hidden className="h-4 w-4" />
              </StepButton>
              <span className={`${TYPE.figure} min-w-8 text-center text-white/90`} data-testid="pipeline-verb-count">
                {count}
              </span>
              <StepButton label="One more" disabled={busy || count >= COUNT_MAX} onClick={() => setCount((n) => clamp(n + 1))}>
                <Plus aria-hidden className="h-4 w-4" />
              </StepButton>
              <span className={`${TYPE.figure} text-white/40`}>
                {COUNT_MIN}–{COUNT_MAX}
              </span>
            </div>
          </Field>
        )}
        {phase.kind === "failed" && <Failure reason={phase.reason} />}
      </form>
    </Modal>
  );
}

function clamp(n: number): number {
  return Math.max(COUNT_MIN, Math.min(COUNT_MAX, Math.round(Number.isFinite(n) ? n : COUNT_MIN)));
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-white/15 text-white/80 transition hover:border-cyan-300/50 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
