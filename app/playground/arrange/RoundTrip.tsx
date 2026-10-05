"use client";

// THE MANUAL STAGES, FIRST-CLASS. Remaster and edit are done by hand in Suno's
// studio today (brief, Decisions: "No ffmpeg remaster this round"), so a card
// in either column carries the whole round trip on its face: the file to take
// there, the prompt it was made from, the step, and a drop zone for what comes
// back. The returned file becomes the stack's next version
// (useArrange.ts#fileReturn: parentId = the head, origin "suno-return").
//
// The drop zone has two halves because the operator decides where the new
// version sits: still in this stage (another pass to come) or one stage on.
// A version dropped toward FINALIZED needs its library label first — the
// prompt opens with the file held, and nothing is uploaded until it is named.

import { useRef, useState } from "react";

import { ArrowRight, Download, Hand, Upload } from "lucide-react";

import { takeFileUrl } from "@/lib/sound/client";
import type { SoundKind, SoundTake, Stage } from "@/lib/sound/types";

import { LabelPrompt } from "./LabelPrompt";
import { nextStage, suggestLabel, type Stack } from "./model";
import { CopyButton, MONO_CAPS as CAPS } from "./parts";

/** Suno's studio, as the operator walks it — one line per manual stage. An
 *  effect is seconds long and has no sections to replace, so its edit is the
 *  editor's trim and fade. */
const STEP: Record<SoundKind, Record<"remaster" | "edit", string>> = {
  music: { remaster: "upload → Remaster → download WAV", edit: "upload → Edit → replace section → download WAV" },
  sfx: { remaster: "upload → Remaster → download WAV", edit: "upload → Edit → trim · fade → download WAV" },
};

const EXT: Record<string, string> = { "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/flac": "flac" };

export function fileName(t: SoundTake) {
  const ext = t.file ? (t.file.path.match(/\.([a-z0-9]+)$/i)?.[1] ?? EXT[t.file.mime] ?? "audio") : "audio";
  const base = t.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || t.id;
  return `${base}.${ext}`;
}

export function RoundTrip({
  stack,
  stage,
  busy,
  onFile,
}: {
  stack: Stack;
  stage: "remaster" | "edit";
  busy: boolean;
  onFile: (file: File, to: Stage, label?: string | null) => Promise<boolean>;
}) {
  const h = stack.head;
  const next = nextStage(stage)!;
  const [held, setHeld] = useState<File | null>(null);

  const take = (file: File | undefined, to: Stage) => {
    if (!file) return;
    if (to === "finalized" && !h.label?.trim()) setHeld(file);
    else void onFile(file, to, to === "finalized" ? h.label : null);
  };

  return (
    <div data-nodrag className="mt-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.03] p-2.5">
      <p className="flex min-w-0 items-baseline gap-2">
        <Hand className="h-4 w-4 shrink-0 translate-y-0.5 text-amber-200/70" aria-hidden />
        <span className={`${CAPS} shrink-0 text-amber-200/80`}>suno</span>
        <span className="font-hanken text-label leading-snug text-white/60">{STEP[h.kind][stage]}</span>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {h.file ? (
          <a
            href={takeFileUrl(h.id)}
            download={fileName(h)}
            data-nodrag
            aria-label={`Download ${h.title} for Suno`}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-2.5 py-1 font-jetbrains text-label text-white/65 transition hover:border-white/25 hover:text-white"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            file
          </a>
        ) : (
          <span className="font-jetbrains text-label text-rose-300/80">no file</span>
        )}
        {h.prompt.trim() ? (
          <CopyButton text={h.prompt} label={`Copy the prompt of ${h.title}`}>
            prompt
          </CopyButton>
        ) : (
          <span className="font-jetbrains text-label text-white/30">no prompt</span>
        )}
      </div>
      {held ? (
        <div className="mt-2">
          <LabelPrompt
            title={`${held.name} → finalized`}
            initial={suggestLabel(h, h.group)}
            busy={busy}
            onCancel={() => setHeld(null)}
            onConfirm={async (label) => {
              const ok = await onFile(held, "finalized", label);
              if (ok) setHeld(null);
            }}
          />
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Drop label={stage} sr={`Drop the Suno return for ${h.title}; it stays in ${stage}`} busy={busy} onFile={(f) => take(f, stage)} />
          <Drop
            label={next}
            arrow
            sr={`Drop the Suno return for ${h.title}; it moves to ${next}`}
            busy={busy}
            onFile={(f) => take(f, next)}
          />
        </div>
      )}
    </div>
  );
}

/** One half of the drop zone: a file dropped on it, or picked through it. */
function Drop({ label, sr, arrow = false, busy, onFile }: { label: string; sr: string; arrow?: boolean; busy: boolean; onFile: (f: File | undefined) => void }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
    <button
      type="button"
      data-nodrag
      disabled={busy}
      aria-label={sr}
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFile(e.dataTransfer.files[0]);
      }}
      className={`flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border font-jetbrains text-label transition disabled:cursor-wait ${
        busy
          ? "animate-pulse border-amber-300/30 text-amber-100/70"
          : over
            ? "border-amber-300/60 bg-amber-300/[0.12] text-amber-50 shadow-[0_0_16px] shadow-amber-300/20"
            : "border-white/10 bg-white/[0.02] text-white/55 hover:border-amber-300/35 hover:text-amber-100"
      }`}
    >
      {arrow ? <ArrowRight className="h-4 w-4" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
      {label}
    </button>
      <input
        ref={input}
        type="file"
        accept="audio/*"
        tabIndex={-1}
        className="sr-only"
        aria-hidden
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );
}
