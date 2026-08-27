"use client";

// THE COMPARISON — source beside candidate, and under them the reason the
// grader gave. The per-field table is the audit handle: when the score looks
// wrong, the source→candidate pair on one row says whether the grader misread
// the image or the brief.
//
// A verdict pressed here shows on the candidate itself — stamp and border —
// before anything else happens, and the buttons are idempotent: Reject
// rejects, Keep keeps, Clear clears. On a committed run the footer says so
// and offers nothing.

import { useEffect } from "react";

import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Primitives";
import type { Candidate, RunManifest, Verdict } from "@/lib/foundry/types";

import { fileUrl } from "./foundryClient";
import { VerdictStamp, creditTone, pct } from "./parts";

const STYLE_FIELDS = ["render_mode", "palette_strategy", "edge_treatment", "black_handling"];

export function Lightbox({
  run,
  candidate,
  verdict,
  readOnly,
  onClose,
  onVerdict,
  onStep,
}: {
  run: RunManifest;
  candidate: Candidate | null;
  verdict: Verdict | undefined;
  readOnly: boolean;
  onClose: () => void;
  onVerdict: (v: Verdict | null) => void;
  onStep: (d: 1 | -1) => void;
}) {
  useEffect(() => {
    if (!candidate) return;
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "k":
        case "K":
          if (!readOnly) onVerdict("keep");
          break;
        case "x":
        case "X":
          if (!readOnly) onVerdict("reject");
          break;
        case "u":
        case "U":
          if (!readOnly) onVerdict(null);
          break;
        case "ArrowRight":
          e.preventDefault();
          onStep(1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          onStep(-1);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [candidate, readOnly, onVerdict, onStep]);

  const scene = candidate ? run.scenes.find((s) => s.id === candidate.scene) : null;
  const style = candidate ? run.styles[candidate.style] : null;
  const g = candidate?.grade;

  return (
    <Modal
      open={Boolean(candidate)}
      onClose={onClose}
      title={candidate ? `${style?.name ?? candidate.style} · ${candidate.mechanism}` : ""}
      eyebrow={candidate?.id}
      className="max-w-6xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="font-jetbrains text-[11px] text-white/45">
            {readOnly ? "this run is committed — verdicts are final" : "← → step · K keep · X reject · U clear · Esc close"}
          </div>
          {!readOnly && (
            <div className="flex items-center gap-2">
              <span
                className={`font-jetbrains mr-2 text-[11px] ${
                  verdict === "keep" ? "text-emerald-200" : verdict === "reject" ? "text-rose-200" : "text-white/35"
                }`}
              >
                {verdict === "keep" ? "kept" : verdict === "reject" ? "rejected" : "undecided"}
              </span>
              {verdict && (
                <button
                  onClick={() => onVerdict(null)}
                  className="font-jetbrains cursor-pointer rounded-full border border-white/15 px-4 py-2 text-[12px] text-white/70 transition hover:bg-white/5"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => onVerdict("reject")}
                className={`font-jetbrains cursor-pointer rounded-full border px-5 py-2 text-[12px] transition ${
                  verdict === "reject"
                    ? "border-rose-300 bg-rose-400/30 text-rose-50 ring-2 ring-rose-300/40"
                    : "border-rose-400/40 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20"
                }`}
              >
                {verdict === "reject" ? "Rejected ✓" : "Reject"}
              </button>
              <Button
                onClick={() => onVerdict("keep")}
                className={`cursor-pointer px-5 py-2 ${verdict === "keep" ? "ring-2 ring-emerald-200/60" : "opacity-80"}`}
              >
                {verdict === "keep" ? "Kept ✓" : "Keep"}
              </Button>
            </div>
          )}
        </div>
      }
    >
      {candidate && scene && (
        <div className="flex flex-col gap-5">
          <div className="grid gap-2 md:grid-cols-2">
            <figure className="overflow-hidden rounded-lg border border-white/10 bg-black/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl(run.id, scene.source)} alt="source" className="w-full" />
              <figcaption className="font-jetbrains px-3 py-1.5 text-[10px] tracking-[0.14em] text-white/50 uppercase">source · {scene.id}</figcaption>
            </figure>
            <figure
              className={`relative overflow-hidden rounded-lg border-2 bg-black/50 transition ${
                verdict === "keep" ? "border-emerald-300/80" : verdict === "reject" ? "border-rose-400/80" : "border-white/10"
              }`}
            >
              {candidate.deleted ? (
                <div className="font-jetbrains flex aspect-video items-center justify-center text-white/40">deleted</div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(run.id, candidate.file)} alt={candidate.id} className={`w-full transition ${verdict === "reject" ? "opacity-50" : ""}`} />
              )}
              <VerdictStamp verdict={verdict} />
              <figcaption className="font-jetbrains px-3 py-1.5 text-[10px] tracking-[0.14em] text-white/50 uppercase">
                candidate · {candidate.mechanism} · seed {candidate.seed}
                {candidate.timings?.generate_s ? ` · ${candidate.timings.generate_s}s` : ""}
              </figcaption>
            </figure>
          </div>

          {g ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                <div className="flex items-baseline justify-between">
                  <div className="font-jetbrains text-[11px] tracking-[0.14em] text-cyan-300 uppercase">craft fidelity</div>
                  <div className="font-jetbrains text-[13px] text-white">{pct(g.craft?.score)}</div>
                </div>
                <p className="font-hanken mt-1 text-[11px] text-slate-500">Did the shot survive? Source annotation → candidate re-annotation, per field.</p>
                <table className="mt-3 w-full text-[11px]">
                  <tbody>
                    {Object.entries(g.craft?.per_field ?? {}).map(([f, v]) => (
                      <tr key={f} className="border-t border-white/6">
                        <td className="font-jetbrains py-1 pr-2 text-white/50">{f.replace(/_/g, " ")}</td>
                        <td className="font-jetbrains py-1 pr-2 text-white/80">{String(scene.annotation?.[f] ?? "—")}</td>
                        <td className={`font-jetbrains py-1 ${creditTone(v)}`}>{String(g.craft?.annotation?.[f] ?? "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                <div className="flex items-baseline justify-between">
                  <div className="font-jetbrains text-[11px] tracking-[0.14em] text-violet-300 uppercase">style adherence</div>
                  <div className="font-jetbrains text-[13px] text-white">{pct(g.style?.score)}</div>
                </div>
                <p className="font-hanken mt-1 text-[11px] text-slate-500">Did the look arrive? Target observables → what the grader read back.</p>
                <table className="mt-3 w-full text-[11px]">
                  <tbody>
                    {STYLE_FIELDS.map((f) => {
                      const want = style?.observables[f];
                      const got = g.style?.readback?.[f as keyof typeof g.style.readback];
                      return (
                        <tr key={f} className="border-t border-white/6">
                          <td className="font-jetbrains py-1 pr-2 text-white/50">{f.replace(/_/g, " ")}</td>
                          <td className="font-jetbrains py-1 pr-2 text-white/80">{want ?? "—"}</td>
                          <td className={`font-jetbrains py-1 ${creditTone(g.style?.per_field?.[f])}`}>{String(got ?? "—")}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-white/6">
                      <td className="font-jetbrains py-1 pr-2 text-white/50">text present</td>
                      <td />
                      <td className={`font-jetbrains py-1 ${g.veto?.has_text ? "text-rose-300" : "text-emerald-300"}`}>{g.veto ? String(g.veto.has_text) : "—"}</td>
                    </tr>
                    <tr className="border-t border-white/6">
                      <td className="font-jetbrains py-1 pr-2 text-white/50">colours</td>
                      <td />
                      <td className="font-jetbrains py-1 text-white/80">{g.style?.readback?.dominant_colours?.join(", ") ?? "—"}</td>
                    </tr>
                  </tbody>
                </table>
                {g.style?.readback?.depiction && (
                  <p className="font-hanken mt-3 text-[12px] text-slate-300">“{g.style.readback.depiction}”</p>
                )}
                {g.unmeasured.length > 0 && (
                  <p className="font-jetbrains mt-2 text-[10px] text-amber-200/80">unmeasured: {g.unmeasured.join(" · ")}</p>
                )}
                <p className="font-jetbrains mt-2 text-[9px] text-white/30">graded by {g.grader}</p>
              </div>
            </div>
          ) : (
            <p className="font-jetbrains text-[11px] text-amber-200/80">Not graded yet.</p>
          )}

          {candidate.prompt && (
            <details className="rounded-xl border border-white/8 bg-white/[0.02]">
              <summary className="font-jetbrains cursor-pointer px-4 py-2 text-[11px] tracking-[0.14em] text-white/50 uppercase">prompt</summary>
              <pre className="font-jetbrains px-4 pb-4 text-[11px] leading-relaxed whitespace-pre-wrap text-slate-400">{candidate.prompt}</pre>
            </details>
          )}
        </div>
      )}
    </Modal>
  );
}
