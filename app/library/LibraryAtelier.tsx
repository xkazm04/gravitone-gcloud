"use client";

// ATELIER — the library as a studio wall. Three panes: commissions begin on
// the left (a brief, or a preset off the shelf), the wall of looks holds the
// middle, and the dossier on the right is where a look earns its lock. The
// metaphor: styles are commissioned works pinned to a wall, not rows in a
// table — you walk up to one.

import { useState } from "react";

import { Panel } from "@/components/ui/Primitives";

import { GateChip, PaletteDots, ProofThumb, StatusStamp } from "./parts";
import { ORIGIN_WORD, PRESETS, PROOF_CAP, THEMES, approvedCount, canLock } from "./themes";

export default function LibraryAtelier() {
  const [themeId, setThemeId] = useState(THEMES[0].id);
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];

  return (
    <div className="grid gap-5 lg:grid-cols-[230px_1fr_300px]">
      {/* ── Commission rail ── */}
      <aside className="space-y-4">
        <p className="font-jetbrains text-[11px] tracking-[0.18em] text-white/40 uppercase">commission a look</p>
        <button className="font-hanken w-full rounded-xl border border-dashed border-cyan-400/30 bg-cyan-400/[0.04] px-4 py-4 text-left text-sm text-cyan-100 transition hover:bg-cyan-400/[0.08]">
          <span className="font-instrument block text-lg text-white">From a brief</span>
          <span className="mt-1 block text-[13px] leading-snug text-slate-400">
            Describe the look in your words — Claude writes the style block.
          </span>
        </button>
        <div className="space-y-2">
          <p className="font-jetbrains text-[11px] tracking-[0.18em] text-white/40 uppercase">or a preset</p>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className="group flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 text-left transition hover:border-cyan-400/30"
            >
              <span className={`h-9 w-9 shrink-0 rounded-lg border border-white/10 bg-gradient-to-br ${p.tone}`} aria-hidden />
              <span>
                <span className="font-hanken block text-sm text-white/85">{p.name}</span>
                <span className="block text-[11px] leading-snug text-slate-500 group-hover:text-slate-400">{p.line}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* ── The wall ── */}
      <section className="space-y-4">
        {THEMES.map((t) => (
          <Panel
            key={t.id}
            className={`cursor-pointer p-4 transition ${t.id === themeId ? "border-cyan-400/35" : "hover:border-white/20"}`}
          >
            <button className="w-full text-left" onClick={() => setThemeId(t.id)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-instrument text-2xl text-white">{t.name}</h3>
                  <p className="font-jetbrains mt-0.5 text-[11px] text-white/40">
                    {ORIGIN_WORD[t.origin]} · touched {t.updated}
                    {t.usedBy > 0 && <span className="text-cyan-300/80"> · {t.usedBy} projects on it</span>}
                  </p>
                </div>
                <StatusStamp status={t.status} />
              </div>
              {t.proofs.length > 0 ? (
                <div className="mt-3 grid grid-cols-6 gap-2">
                  {t.proofs.map((p) => (
                    <ProofThumb key={p.id} proof={p} className="h-14" />
                  ))}
                </div>
              ) : (
                <p className="font-jetbrains mt-3 rounded-lg border border-dashed border-white/10 px-3 py-3 text-[11px] text-white/35">
                  no proofs yet — the block below is words until Leonardo renders it
                </p>
              )}
              <div className="mt-3 flex items-center justify-between">
                <PaletteDots palette={t.block.palette} />
                <span className="font-jetbrains text-[11px] text-white/40">{t.elements.join(" · ")}</span>
              </div>
            </button>
          </Panel>
        ))}
      </section>

      {/* ── Dossier ── */}
      <aside className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-jetbrains text-[11px] tracking-[0.18em] text-white/40 uppercase">dossier</p>
          <GateChip />
        </div>
        <Panel className="space-y-3 p-4">
          <h4 className="font-instrument text-xl text-white">{theme.name}</h4>
          <Slot label="technique" value={theme.block.technique} />
          <Slot label="subject" value={theme.block.subject} />
          <div>
            <p className="font-jetbrains mb-1 text-[10px] tracking-[0.14em] text-white/40 uppercase">palette</p>
            <PaletteDots palette={theme.block.palette} withNames />
          </div>
          <Slot label="finish" value={theme.block.finish} />
        </Panel>
        <Panel className="p-4">
          <div className="flex items-baseline justify-between">
            <p className="font-jetbrains text-[10px] tracking-[0.14em] text-white/40 uppercase">proof sheet</p>
            <p className="font-jetbrains text-[11px] text-white/40">
              {approvedCount(theme)} approved · {theme.proofs.length}/{PROOF_CAP}
            </p>
          </div>
          {theme.proofs.length > 0 ? (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {theme.proofs.map((p) => (
                <ProofThumb key={p.id} proof={p} className="h-14" />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[13px] leading-snug text-slate-400">
              Nothing rendered yet. The first commission sends the block to Leonardo and pins the plates here.
            </p>
          )}
          {theme.proofs.some((p) => p.state === "rejected") && (
            <p className="mt-2 text-[12px] leading-snug text-rose-200/80">
              {theme.proofs.find((p) => p.state === "rejected")?.note}
            </p>
          )}
        </Panel>
        <button
          disabled={!canLock(theme)}
          className="w-full rounded-xl bg-cyan-300/90 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-40"
        >
          {theme.status === "locked"
            ? "locked — projects build on this"
            : canLock(theme)
              ? "lock this style"
              : "approve every proof to lock"}
        </button>
        <p className="font-jetbrains text-[10px] leading-relaxed text-white/30">
          brief → claude writes the block → leonardo renders proofs → you approve → locked
        </p>
      </aside>
    </div>
  );
}

function Slot({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-jetbrains mb-0.5 text-[10px] tracking-[0.14em] text-white/40 uppercase">{label}</p>
      <p className="font-hanken text-[13px] leading-snug text-slate-300">{value}</p>
    </div>
  );
}
