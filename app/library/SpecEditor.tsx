"use client";

// The dossier's editable half — the four slots, and the lock.
//
// Editing is allowed until the moment a theme locks, and then it is not. That
// is the ratchet the whole surface is built on: a locked style is one that a
// human approved *specific rendered evidence* for, so letting the words change
// underneath afterwards would leave projects citing an identity that was never
// proved. Unlock is deliberately absent — the move is to duplicate, not to edit
// history.

import { Lock } from "lucide-react";

import { canLock, lockBlocker, statusOf, type StyleBlock, type Theme } from "@/lib/themes";
import { compileStyleBlock } from "@/lib/stylePrompt";

export default function SpecEditor({
  theme,
  onChange,
  onRename,
  onLock,
}: {
  theme: Theme;
  onChange: (block: StyleBlock) => void;
  /** The name came here with the proof sheet's header. A style's name is one of
   *  its words, and every other word it has is edited on this panel. */
  onRename: (name: string) => void;
  onLock: () => void;
}) {
  const locked = statusOf(theme) === "locked";
  const set = (k: keyof StyleBlock, v: string) => onChange({ ...theme.block, [k]: v });
  const blocker = lockBlocker(theme);

  return (
    <div className="space-y-3">
      <input
        value={theme.name}
        onChange={(e) => onRename(e.target.value)}
        disabled={locked}
        aria-label="Style name"
        className="font-instrument w-full rounded bg-transparent text-xl text-white disabled:opacity-100"
      />

      {/* TECHNIQUE and SUBJECT moved to the playground. They are the two slots
          that decide what a render looks like, and they were being edited three
          panes away from the button that spends money on the result. The
          dossier keeps what it is FOR: the finish, the compiled prompt, and the
          lock.

          The palette section went entirely. It was read-only — a list of the
          three colours with their names and roles, repeating what the dots on
          the style's own pill already show, and repeating it identically across
          presets that share a colour name. The preset's colours are the
          preset's; there is nothing to pick here. */}
      <Slot label="finish" value={theme.block.finish} locked={locked} onChange={(v) => set("finish", v)} />

      <details className="group">
        <summary className="font-jetbrains cursor-pointer list-none text-label tracking-[0.14em] text-white/40 uppercase hover:text-white/60">
          compiled prompt ▸
        </summary>
        <p className="font-jetbrains mt-1.5 rounded-lg border border-white/8 bg-white/[0.02] p-2.5 text-content leading-relaxed text-slate-400">
          {compileStyleBlock(theme.block)}
        </p>
      </details>

      {locked ? (
        <p className="font-jetbrains flex items-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/[0.06] px-3 py-2.5 text-content text-cyan-200">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          locked — projects build on this
        </p>
      ) : (
        <div>
          <button
            onClick={onLock}
            disabled={!canLock(theme)}
            className="w-full rounded-xl bg-cyan-300/90 py-2.5 text-label font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-40"
          >
            lock this style
          </button>
          {blocker && <p className="mt-1.5 text-center text-content text-white/40">{blocker}</p>}
        </div>
      )}
    </div>
  );
}

function Slot({
  label,
  value,
  locked,
  onChange,
}: {
  label: string;
  value: string;
  locked: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="font-jetbrains mb-1 text-content tracking-[0.14em] text-white/40 uppercase">{label}</p>
      {locked ? (
        <p className="font-hanken text-content leading-snug text-slate-300">{value}</p>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="font-hanken w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-content leading-snug text-slate-200 focus:border-cyan-400/40"
        />
      )}
    </div>
  );
}
