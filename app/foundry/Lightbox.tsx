"use client";

// THE COMPARISON — source beside candidate at full width, and under them the
// reason the grader gave. The per-field table is the audit handle: when the score
// looks wrong, the source→candidate pair on one row says whether the grader misread
// the image or the brief.
//
// A verdict pressed here shows on the candidate itself — the ring and the stamp —
// before anything else happens, and the buttons are idempotent: Reject rejects,
// Keep keeps, Clear clears. On a committed run the footer says so and offers
// nothing. ← and → step through the run in place.
//
// Drawn on the app's own Modal (components/ui/Modal.tsx) at near-full width, in
// the round-2 idiom: the two pictures large and rounded, the two grade panels as
// glass cards whose per-field rows carry a dot for matched / missed.
//
// AND THE RECORD BEHIND EACH JUDGEMENT (round 3), which no version of this
// surface had drawn: when the human's verdict was made and the note it carries
// (VerdictRecord — the store keeps `note`, lib/foundry/store.ts), when the
// grader graded, and every timing the forge wrote rather than the first one
// (forge.py writes `generate_s`, then `grade_s` beside it). A slow candidate is
// a different question from a bad one, and both are answered here or nowhere.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";

import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Primitives";
import { Keycaps } from "@/components/ui/signal";
import type { Candidate, RunManifest, Verdict, VerdictRecord } from "@/lib/foundry/types";

import { artStateOf, workingIdOf } from "./CullGrid";
import { when } from "./RunCards";
import { fileUrl } from "./foundryClient";
import { Art, FlagPill, Label, ScorePill, StatusChip, VerdictButtons, VerdictStamp, gradeOf, pct, verdictRing } from "./ui";
import { refusedKey } from "./keyGuard";

const STYLE_FIELDS = ["render_mode", "palette_strategy", "edge_treatment", "black_handling"];

/** One per-field credit: 1 matched, 0.5 half, 0 missed, absent unscored. */
function Credit({ value, children }: { value: number | undefined; children: React.ReactNode }) {
  const tone = value === 1 ? "bg-emerald-300" : value === 0.5 ? "bg-amber-300" : value === 0 ? "bg-rose-400" : "bg-white/15";
  const word = value === 1 ? "matched" : value === 0.5 ? "half" : value === 0 ? "missed" : "";
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${tone}`} />
      <span className={value === 0 ? "text-rose-100/90" : "text-white/85"}>{children}</span>
      {word && <span className="sr-only"> ({word})</span>}
    </span>
  );
}

function GradeTable({ head, rows }: { head: [string, string, string]; rows: [string, React.ReactNode, React.ReactNode][] }) {
  return (
    <table className="w-full border-separate border-spacing-0 text-left">
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col" className="font-jetbrains border-b border-white/8 pb-2 text-label font-normal tracking-[0.12em] text-white/40 uppercase">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(([f, a, b]) => (
          <tr key={f}>
            <th scope="row" className="font-jetbrains border-b border-white/[0.05] py-2 pr-3 text-label font-normal text-white/50">
              {f}
            </th>
            <td className="font-hanken border-b border-white/[0.05] py-2 pr-3 text-label text-white/70">{a}</td>
            <td className="font-hanken border-b border-white/[0.05] py-2 text-label text-white/80">{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** "generate_s" → "generate", the unit moved onto the figure. */
function timingLabel(k: string): string {
  return k.replace(/_s$/, "").replace(/_/g, " ");
}

export function Lightbox({
  run,
  candidate,
  verdict: record,
  readOnly,
  onClose,
  onVerdict,
  onStep,
  index,
  count,
}: {
  run: RunManifest;
  candidate: Candidate | null;
  verdict: VerdictRecord | undefined;
  readOnly: boolean;
  onClose: () => void;
  onVerdict: (v: Verdict | null) => void;
  onStep: (d: 1 | -1) => void;
  /** Position of the open candidate in the run, for the ends of the arrows. */
  index: number;
  count: number;
}) {
  const artState = artStateOf(candidate ?? undefined, candidate ? workingIdOf(run) === candidate.id : false);
  // Verdicts exist only on a picture that is drawn: the tile shows no stamp on any
  // other state and the bar's counts leave them out.
  const canVerdict = artState === "ready";

  useEffect(() => {
    if (!candidate) return;
    const onKey = (e: KeyboardEvent) => {
      if (refusedKey(e)) return;
      switch (e.key) {
        case "k":
        case "K":
          if (!readOnly && canVerdict) onVerdict("keep");
          break;
        case "x":
        case "X":
          if (!readOnly && canVerdict) onVerdict("reject");
          break;
        case "u":
        case "U":
          if (!readOnly && canVerdict) onVerdict(null);
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
  }, [candidate, readOnly, canVerdict, onVerdict, onStep]);

  const verdict: Verdict | undefined = record?.verdict;
  const scene = candidate ? run.scenes.find((s) => s.id === candidate.scene) : null;
  const style = candidate ? run.styles[candidate.style] : null;
  const g = candidate?.grade;
  const subject = candidate ? `${style?.name ?? candidate.style}, ${candidate.mechanism}` : "";

  const stepBtn = (d: 1 | -1) => {
    const off = d === -1 ? index <= 0 : index >= count - 1;
    const Icon = d === -1 ? ChevronLeft : ChevronRight;
    return (
      <button
        type="button"
        disabled={off}
        onClick={() => onStep(d)}
        aria-label={d === -1 ? "Previous candidate" : "Next candidate"}
        className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-white/12 text-white/70 transition hover:border-white/30 hover:text-white disabled:cursor-default disabled:opacity-30"
      >
        <Icon aria-hidden className="h-4 w-4" />
      </button>
    );
  };

  return (
    <Modal
      open={Boolean(candidate)}
      onClose={onClose}
      title={candidate ? `${style?.name ?? candidate.style} · ${candidate.mechanism}` : ""}
      eyebrow={candidate ? <Label>{candidate.id}</Label> : undefined}
      className="max-w-[min(1560px,96vw)]"
      footer={
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-2">
            {stepBtn(-1)}
            <span className="font-jetbrains text-label text-white/45 tabular-nums">
              {index + 1}/{count}
            </span>
            {stepBtn(1)}
          </span>
          {readOnly ? (
            <StatusChip kind="committed" word="committed · verdicts are final" />
          ) : (
            <Keycaps
              label="Comparison shortcuts"
              map={[
                { keys: ["←", "→"], does: "step" },
                ...(canVerdict
                  ? [
                      { keys: ["K"], does: "keep" },
                      { keys: ["X"], does: "reject" },
                      { keys: ["U"], does: "clear" },
                    ]
                  : []),
                { keys: ["Esc"], does: "close" },
              ]}
            />
          )}
          {!readOnly && canVerdict && (
            <span className="ml-auto flex items-center gap-3">
              <span className={`font-jetbrains text-label ${verdict === "keep" ? "text-emerald-200" : verdict === "reject" ? "text-rose-200" : "text-white/45"}`}>
                {verdict === "keep" ? "kept" : verdict === "reject" ? "rejected" : "undecided"}
              </span>
              {verdict && (
                <Button variant="ghost" size="sm" onClick={() => onVerdict(null)}>
                  Clear
                </Button>
              )}
              <VerdictButtons value={verdict} subject={subject} onVerdict={(v) => onVerdict(v)} />
            </span>
          )}
        </div>
      }
    >
      {candidate && scene && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 md:grid-cols-2">
            <figure className="flex flex-col gap-2">
              <Art src={fileUrl(run.id, scene.source)} alt={`source, ${scene.id}`} className="aspect-video" />
              <figcaption className="flex flex-col gap-1 px-1">
                <Label>source · {scene.id}</Label>
                {scene.note && <span className="font-hanken text-content leading-snug text-white/60">{scene.note}</span>}
              </figcaption>
            </figure>
            <figure className="flex flex-col gap-2">
              <div className={`rounded-xl transition ${verdictRing(verdict)}`}>
                <Art
                  src={canVerdict ? fileUrl(run.id, candidate.file) : undefined}
                  state={artState}
                  alt={candidate.id}
                  className="aspect-video"
                >
                  {canVerdict && verdict && <VerdictStamp verdict={verdict} className="absolute top-3 left-3" />}
                </Art>
              </div>
              <figcaption className="flex flex-col gap-1 px-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <Label>
                    candidate · {candidate.mechanism} · seed {candidate.seed}
                  </Label>
                  {candidate.timings && Object.keys(candidate.timings).length > 0 && (
                    <span className="font-jetbrains flex shrink-0 items-baseline gap-3 text-label text-white/40">
                      {Object.entries(candidate.timings).map(([k, v]) => (
                        <span key={k}>
                          {timingLabel(k)} <span className="text-white/70 tabular-nums">{v}s</span>
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                {artState === "failed" && candidate.error && (
                  <span className="font-jetbrains text-label break-words text-rose-200/80">{candidate.error}</span>
                )}
                {record && (
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <span className={`font-jetbrains shrink-0 text-label ${record.verdict === "keep" ? "text-emerald-200/90" : "text-rose-200/90"}`}>
                      {record.verdict === "keep" ? "kept" : "rejected"} {when(record.at)}
                    </span>
                    {record.note && <span className="font-hanken text-content leading-snug text-white/75">“{record.note}”</span>}
                  </span>
                )}
              </figcaption>
            </figure>
          </div>

          {g ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-instrument text-xl text-white">Shot · craft fidelity</h3>
                  <ScorePill label="craft" value={g.craft?.score} />
                </div>
                <GradeTable
                  head={["field", "source", "candidate"]}
                  rows={Object.entries(g.craft?.per_field ?? {}).map(([f, v]) => [
                    f.replace(/_/g, " "),
                    String(scene.annotation?.[f] ?? "—"),
                    <Credit key={f} value={v}>
                      {String(g.craft?.annotation?.[f] ?? "—")}
                    </Credit>,
                  ])}
                />
              </section>

              <section className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-instrument text-xl text-white">Look · style adherence</h3>
                  <ScorePill label="style" value={g.style?.score} />
                </div>
                <GradeTable
                  head={["field", "wanted", "candidate"]}
                  rows={[
                    ...STYLE_FIELDS.map((f): [string, React.ReactNode, React.ReactNode] => {
                      const want = style?.observables[f];
                      const got = g.style?.readback?.[f as keyof typeof g.style.readback];
                      return [
                        f.replace(/_/g, " "),
                        want ?? "—",
                        <Credit key={f} value={g.style?.per_field?.[f]}>
                          {String(got ?? "—")}
                        </Credit>,
                      ];
                    }),
                    [
                      "text present",
                      "",
                      <Credit key="text" value={g.veto ? (g.veto.has_text ? 0 : 1) : undefined}>
                        {g.veto ? String(g.veto.has_text) : "—"}
                      </Credit>,
                    ],
                    ["colours", "", g.style?.readback?.dominant_colours?.join(", ") ?? "—"],
                  ]}
                />
                {g.style?.readback?.depiction && (
                  <blockquote className="font-hanken mt-4 border-l-2 border-cyan-300/40 pl-3 text-content leading-snug text-white/70 italic">“{g.style.readback.depiction}”</blockquote>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {g.unmeasured.length > 0 && (
                    <span className="font-jetbrains rounded-md border border-amber-400/30 bg-amber-400/[0.08] px-2 py-0.5 text-label text-amber-100/90">
                      unmeasured: {g.unmeasured.join(" · ")}
                    </span>
                  )}
                  <span className="font-jetbrains text-label text-white/35">
                    graded by {g.grader} · {when(g.at)}
                  </span>
                  <span className="sr-only">overall {gradeOf(g.style?.score)}</span>
                </div>
              </section>
            </div>
          ) : (
            <div>
              <FlagPill kind="unmeasured" />
              <span className="font-jetbrains ml-2 text-label text-white/45">not graded · {pct(null)}</span>
            </div>
          )}

          {candidate.prompt && (
            <details className="group rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
              <summary className="font-jetbrains cursor-pointer text-label tracking-[0.14em] text-white/50 uppercase">prompt</summary>
              <pre className="font-jetbrains mt-3 text-label leading-6 whitespace-pre-wrap text-white/75">{candidate.prompt}</pre>
            </details>
          )}
        </div>
      )}
    </Modal>
  );
}
