"use client";

// SPECIMEN — the library as a foundry book. Every theme is a full-width
// specimen sheet read left to right: the spec (the four slots, set like type),
// the proofs (a filmstrip of plates), and the provenance rail where the sheet
// either earns its lock stamp or says what it is waiting on. Creation is a
// press at the top — the commission bar shows the whole pipeline as stations,
// so "where is my style?" is always answerable at a glance.

import { Panel } from "@/components/ui/Primitives";

import { GateChip, PaletteDots, ProofThumb, StatusStamp } from "./parts";
import type { Theme } from "./themes";
import { ORIGIN_WORD, PRESETS, PROOF_CAP, THEMES, approvedCount, canLock } from "./themes";

const STATIONS = ["brief", "block · claude", "proofs · leonardo", "approval", "locked"] as const;

/** Which station a theme is standing at. */
function stationOf(t: Theme): number {
  if (t.status === "locked") return 4;
  if (t.proofs.length === 0) return 2; // block written, waiting on renders
  if (canLock(t)) return 3.5; // everything approved, lock is one press away
  return 3; // proofs on the table, verdicts open
}

export default function LibrarySpecimen() {
  return (
    <div className="space-y-5">
      {/* ── The press ── */}
      <Panel className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-1 items-center gap-3">
            <input
              placeholder="Describe a look — “cutout newsprint, coral on navy, grayscale subjects”"
              className="font-hanken w-full max-w-xl rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-cyan-400/40 focus:outline-none"
            />
            <button className="rounded-xl bg-cyan-300/90 px-5 py-2.5 text-sm font-semibold whitespace-nowrap text-slate-950 transition hover:brightness-110">
              commission
            </button>
          </div>
          <GateChip />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="font-jetbrains text-[10px] tracking-[0.14em] text-white/35 uppercase">presets</span>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className="font-jetbrains rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/55 transition hover:border-cyan-400/30 hover:text-cyan-200"
              title={p.line}
            >
              {p.name}
            </button>
          ))}
        </div>
      </Panel>

      {/* ── The book ── */}
      {THEMES.map((t) => (
        <Panel key={t.id} as="article" className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-instrument text-3xl text-white">{t.name}</h3>
              <p className="font-jetbrains mt-1 text-[11px] text-white/40">
                {ORIGIN_WORD[t.origin]} · touched {t.updated}
                {t.usedBy > 0 && <span className="text-cyan-300/80"> · {t.usedBy} projects on it</span>}
              </p>
            </div>
            <StatusStamp status={t.status} />
          </div>

          <div className="mt-4 grid gap-6 lg:grid-cols-[280px_1fr_220px]">
            {/* the spec, set like type */}
            <dl className="space-y-2.5">
              <SpecLine label="technique" value={t.block.technique} />
              <SpecLine label="subject" value={t.block.subject} />
              <div className="grid grid-cols-[86px_1fr] items-baseline gap-2">
                <dt className="font-jetbrains text-[10px] tracking-[0.14em] text-white/40 uppercase">palette</dt>
                <dd>
                  <PaletteDots palette={t.block.palette} withNames />
                </dd>
              </div>
              <SpecLine label="finish" value={t.block.finish} />
              <SpecLine label="covers" value={t.elements.join(" · ")} mono />
            </dl>

            {/* the plates */}
            <div>
              {t.proofs.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {t.proofs.map((p) => (
                    <ProofThumb key={p.id} proof={p} className="h-20" />
                  ))}
                </div>
              ) : (
                <p className="font-jetbrains flex h-20 items-center justify-center rounded-lg border border-dashed border-white/10 text-[11px] text-white/35">
                  no plates yet — commission sends this spec to leonardo
                </p>
              )}
              {t.proofs.some((p) => p.state === "rejected") && (
                <p className="mt-2 text-[12px] leading-snug text-rose-200/80">
                  {t.proofs.find((p) => p.state === "rejected")?.note}
                </p>
              )}
            </div>

            {/* the provenance rail */}
            <div className="space-y-2">
              {STATIONS.map((s, i) => {
                const at = stationOf(t);
                const passed = i < Math.floor(at) || (i === 4 && t.status === "locked");
                const here = i === Math.floor(at) && t.status !== "locked";
                return (
                  <div key={s} className="flex items-center gap-2.5">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        passed ? "bg-cyan-300" : here ? "bg-amber-300" : "bg-white/15"
                      }`}
                      aria-hidden
                    />
                    <span
                      className={`font-jetbrains text-[11px] ${
                        passed ? "text-white/70" : here ? "text-amber-200" : "text-white/30"
                      }`}
                    >
                      {s}
                    </span>
                  </div>
                );
              })}
              <div className="pt-1.5">
                {t.status === "locked" ? (
                  <p className="font-jetbrains text-[11px] text-cyan-200/80">
                    {approvedCount(t)}/{t.proofs.length} approved · sheet {t.proofs.length}/{PROOF_CAP}
                  </p>
                ) : (
                  <button
                    disabled={!canLock(t)}
                    className="w-full rounded-lg bg-cyan-300/90 py-2 text-[13px] font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-40"
                  >
                    {canLock(t) ? "lock this style" : t.proofs.length === 0 ? "render proofs" : "verdicts open"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function SpecLine({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[86px_1fr] items-baseline gap-2">
      <dt className="font-jetbrains text-[10px] tracking-[0.14em] text-white/40 uppercase">{label}</dt>
      <dd className={mono ? "font-jetbrains text-[11px] text-white/55" : "font-hanken text-[13px] leading-snug text-slate-300"}>
        {value}
      </dd>
    </div>
  );
}
