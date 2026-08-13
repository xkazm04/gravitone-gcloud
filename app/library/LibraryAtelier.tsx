"use client";

// ATELIER — the library as a studio wall, now wired to real tooling.
//
// Three panes: styles begin on the left (a brief, or a preset off the shelf),
// the selected style is worked in the middle (its proof sheet and the
// playground that fills it), and the dossier on the right is where it earns
// its lock.
//
// Every image on this screen is real. The presets are committed renders, the
// proofs come back from /api/imaging/generate and live in IndexedDB, and the
// lock gate reads the sheet rather than a mocked status field.

import { useEffect, useMemo, useState } from "react";

import { Panel } from "@/components/ui/Primitives";
import { useAuth } from "@/lib/useAuth";
import { useThemes } from "@/lib/useThemes";
import { approvedProofs, ORIGIN_WORD, PROOF_CAP, statusOf, type Proof, type Theme } from "@/lib/themes";
import type { GenerateResult } from "@/lib/imagingClient";

import { GateChip, PaletteDots, ProofThumb, StatusStamp } from "./parts";
import Playground from "./Playground";
import PresetRail from "./PresetRail";
import SpecEditor from "./SpecEditor";
import { CANON_SUBJECT, type Preset } from "./presets";

/** What a "from a brief" style starts as — deliberately generic, and every
 *  slot obviously in need of the user's hand. */
const BLANK = {
  technique: "flat vector illustration, even line weight",
  subject: "objects drawn plainly, one idea per frame",
  palette: [
    { name: "ink", hex: "#101418", role: "ground" as const },
    { name: "bone", hex: "#EFEAE0", role: "objects" as const },
    { name: "signal", hex: "#5BC8F5", role: "accent" as const },
  ],
  finish: "matte, generous empty space",
};

export default function LibraryAtelier() {
  const { user } = useAuth();
  const { themes, error, loading, create, update, addProof, judgeProof, lock } = useThemes(user?.uid ?? null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => themes ?? [], [themes]);
  const selected = rows.find((t) => t.id === selectedId) ?? rows[0] ?? null;

  // Follow the newest style in rather than leaving the user on a stale one.
  useEffect(() => {
    if (!selectedId && rows.length) setSelectedId(rows[0].id);
  }, [rows, selectedId]);

  const startFrom = async (p: Preset) => {
    setBusy(true);
    const made = await create({
      name: p.name,
      origin: "preset",
      presetId: p.id,
      block: p.block,
      elements: p.elements,
    });
    if (made) setSelectedId(made.id);
    setBusy(false);
  };

  const startBlank = async () => {
    setBusy(true);
    const made = await create({ name: "Untitled style", origin: "scratch", block: BLANK, elements: [] });
    if (made) setSelectedId(made.id);
    setBusy(false);
  };

  const keepAsProof = async (t: Theme, r: GenerateResult, subject: string) => {
    const img = r.images[0];
    if (!img) return;
    const proof: Proof = {
      id: `pr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      // The subject is the label: a sheet you cannot read back is a sheet you
      // cannot judge, and "proof 4" tells you nothing about what it proved.
      label: subject.split(/[.,]/)[0].slice(0, 42).toLowerCase(),
      base64: img.base64,
      mime: img.mime,
      state: "pending",
      model: r.provenance.model,
      costUsd: r.provenance.costUsd,
      createdAt: Date.now(),
    };
    await addProof(t.id, proof);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_1fr_300px]">
      <PresetRail onPick={startFrom} onScratch={startBlank} busy={busy} />

      <section className="space-y-4">
        {error && (
          <p className="rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-3 text-sm text-rose-200">
            {error} — your styles live in this browser&rsquo;s storage, and it did not answer.
          </p>
        )}

        {loading ? (
          <p className="font-jetbrains py-16 text-center text-[12px] tracking-[0.18em] text-white/30 uppercase">
            reading the wall…
          </p>
        ) : !rows.length ? (
          <EmptyWall />
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {rows.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`font-jetbrains flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] transition ${
                    t.id === selected?.id
                      ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                      : "border-white/10 text-white/50 hover:text-white/80"
                  }`}
                >
                  {t.name}
                  <PaletteDots palette={t.block.palette} />
                </button>
              ))}
            </div>

            {selected && (
              <Panel className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <input
                      value={selected.name}
                      onChange={(e) => void update(selected.id, { name: e.target.value })}
                      disabled={statusOf(selected) === "locked"}
                      className="font-instrument w-full bg-transparent text-2xl text-white focus:outline-none disabled:opacity-100"
                      aria-label="Style name"
                    />
                    <p className="font-jetbrains mt-0.5 text-[11px] text-white/40">
                      {ORIGIN_WORD[selected.origin]} · {approvedProofs(selected).length} approved ·{" "}
                      {selected.proofs.length}/{PROOF_CAP} on the sheet
                    </p>
                  </div>
                  <StatusStamp status={statusOf(selected)} />
                </div>

                {selected.proofs.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {selected.proofs.map((p) => (
                      <ProofThumb
                        key={p.id}
                        proof={p}
                        onJudge={
                          statusOf(selected) === "locked"
                            ? undefined
                            : (state) => void judgeProof(selected.id, p.id, state)
                        }
                      />
                    ))}
                  </div>
                )}

                <div className="border-t border-white/8 pt-4">
                  <Playground
                    block={selected.block}
                    // Newest approved first: the most recent approval is the
                    // best statement of where the style landed.
                    references={approvedProofs(selected)
                      .slice()
                      .sort((a, b) => b.createdAt - a.createdAt)
                      .map((p) => ({ base64: p.base64, mime: p.mime }))}
                    disabled={selected.proofs.length >= PROOF_CAP}
                    onKeep={(r, subject) => keepAsProof(selected, r, subject)}
                  />
                  {selected.proofs.length >= PROOF_CAP && (
                    <p className="mt-2 text-[12px] text-amber-200/90">
                      The sheet is full at {PROOF_CAP} — that is the model&rsquo;s reference-image window.
                      Reject one to make room.
                    </p>
                  )}
                </div>
              </Panel>
            )}
          </>
        )}
      </section>

      <aside className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-jetbrains text-[11px] tracking-[0.18em] text-white/40 uppercase">dossier</p>
          <GateChip themes={rows} />
        </div>
        {selected ? (
          <Panel className="p-4">
            <SpecEditor
              theme={selected}
              onChange={(block) => void update(selected.id, { block })}
              onLock={() => void lock(selected.id)}
            />
          </Panel>
        ) : (
          <Panel className="p-4">
            <p className="text-[13px] leading-snug text-slate-400">
              Pick a preset on the left and its four slots appear here, ready to edit.
            </p>
          </Panel>
        )}
        <p className="font-jetbrains text-[10px] leading-relaxed text-white/30">
          preset or brief → render trials → approve the ones that hold → locked
        </p>
      </aside>
    </div>
  );
}

function EmptyWall() {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
      <p className="font-instrument text-2xl text-white">The wall is empty</p>
      <p className="font-hanken mx-auto mt-2 max-w-sm text-sm leading-snug text-slate-400">
        Start from a preset on the left. You will get its four slots to edit, a playground to render
        trials in, and a proof sheet to approve — that sheet is what locks the style.
      </p>
      <p className="font-jetbrains mx-auto mt-4 max-w-sm text-[11px] leading-snug text-white/30">
        Every preset thumbnail is a real render of the same subject — {CANON_SUBJECT.split(",")[0].toLowerCase()} —
        so the grid varies by style alone.
      </p>
    </div>
  );
}
