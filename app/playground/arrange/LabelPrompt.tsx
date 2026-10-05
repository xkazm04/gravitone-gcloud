"use client";

// THE LIBRARY LABEL, ASKED FOR AT THE DOOR. A finalized take is what agents
// select by label (`pipeline/sound.mts finalized`), and the engine refuses a
// finalize without one (409), so the board asks before it writes. Prefilled
// from the row's group and the take's strongest terms (model.ts#suggestLabel);
// Enter finalizes, Escape puts the card back.

import { useEffect, useId, useRef, useState } from "react";

import { Tag } from "lucide-react";

import { MONO_CAPS as CAPS } from "./parts";

export function LabelPrompt({
  title,
  initial,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  initial: string;
  busy?: boolean;
  onConfirm: (label: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const ok = v.trim().length > 0;
  return (
    <form
      data-nodrag
      role="group"
      aria-labelledby={`${id}-t`}
      onSubmit={(e) => {
        e.preventDefault();
        if (ok && !busy) void onConfirm(v.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
      className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.05] p-3 shadow-[0_0_24px] shadow-emerald-400/10"
    >
      <p id={`${id}-t`} className="flex min-w-0 items-center gap-2">
        <Tag className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
        <span className={`${CAPS} shrink-0 text-emerald-200/80`}>label</span>
        <span className="truncate font-hanken text-label text-white/70">{title}</span>
      </p>
      <input
        ref={input}
        value={v}
        onChange={(e) => setV(e.target.value)}
        aria-label="Library label"
        maxLength={80}
        className="mt-2 w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 font-hanken text-label text-white placeholder:text-white/25 focus:border-emerald-300/50 focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-full border border-white/12 px-3 py-1 font-jetbrains text-label text-white/60 transition hover:border-white/25 hover:text-white"
        >
          cancel
        </button>
        <button
          type="submit"
          disabled={!ok || busy}
          className={`cursor-pointer rounded-full border border-emerald-400/45 bg-emerald-400/15 px-3 py-1 font-jetbrains text-label text-emerald-100 transition hover:bg-emerald-400/25 disabled:cursor-not-allowed disabled:opacity-40 ${busy ? "animate-pulse" : ""}`}
        >
          finalize
        </button>
      </div>
    </form>
  );
}
