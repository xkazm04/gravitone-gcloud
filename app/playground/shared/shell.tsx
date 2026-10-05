"use client";

// WHAT THE SHELL HANDS EVERY MODULE — the kind on screen, a way to say a short
// thing in the flash line, and a way to tell the shell that the store moved so
// its tab tallies (to judge · finalized · hunts) are read again. The modules
// own their own data; the shell owns only those three numbers, and it learns
// they are stale from the module that moved them rather than by polling.

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import type { SoundKind } from "@/lib/sound/types";

export type FlashTone = "ok" | "info" | "error";
export interface Flash {
  id: number;
  text: string;
  tone: FlashTone;
}

export interface SoundLabShell {
  kind: SoundKind;
  /** The store changed (a judgement, a generation, a stage move, a hunt) — re-read the tallies. */
  refresh: () => void;
  /** Bumped on every refresh; a module may key its own reads on it. */
  version: number;
  /** One short line in the flash at the foot of the page. */
  say: (text: string, tone?: FlashTone) => void;
}

export const SoundLabContext = createContext<SoundLabShell | null>(null);

const NOOP: SoundLabShell = { kind: "music", refresh: () => {}, version: 0, say: () => {} };

/** The shell's handle. Outside the shell (a probe, a story) it is inert. */
export function useSoundLab(): SoundLabShell {
  return useContext(SoundLabContext) ?? NOOP;
}

/** The flash's state: one line at a time, gone after a few seconds. */
export function useFlash(ms = 3200): [Flash | null, (text: string, tone?: FlashTone) => void] {
  const [flash, setFlash] = useState<Flash | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash((f) => (f?.id === flash.id ? null : f)), ms);
    return () => clearTimeout(t);
  }, [flash, ms]);
  const say = useCallback((text: string, tone: FlashTone = "ok") => setFlash({ id: Date.now() + Math.random(), text, tone }), []);
  return [flash, say];
}

export function FlashLine({ flash }: { flash: Flash | null }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-5 left-1/2 z-40 -translate-x-1/2">
      {flash && (
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 font-jetbrains text-label backdrop-blur-xl ${
            flash.tone === "error"
              ? "border-rose-400/40 bg-rose-950/60 text-rose-100"
              : flash.tone === "info"
                ? "border-amber-400/35 bg-amber-950/50 text-amber-100"
                : "border-emerald-400/30 bg-emerald-950/50 text-emerald-100"
          }`}
        >
          {flash.text}
        </span>
      )}
    </div>
  );
}

/** An engine's own error, verbatim, in the rose line. */
export function ErrorLine({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/[0.06] px-4 py-2 font-hanken text-label text-rose-100">
      {text}
    </p>
  );
}
