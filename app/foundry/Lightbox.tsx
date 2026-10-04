"use client";

// THE COMPARISON — source beside candidate at full width, and under them the
// reason the grader gave. The per-field table is the audit handle: when the score
// looks wrong, the source→candidate pair on one row says whether the grader misread
// the image or the brief.
//
// A verdict pressed here shows on the candidate itself — the ring and the stamp —
// before anything else happens, and the buttons are idempotent: Reject rejects,
// Keep keeps, Clear clears. On a committed run the footer says so and offers
// nothing. The surface is a full-screen sheet (components/kit/Sheet): ← and → step
// through the run in place, and the candidate is one level below its run in the
// breadcrumb.

import { useEffect } from "react";

import { Button, Chip, Chips, Credit, DataTable, KeyRow, Kicker, Magnitude, Plate, Sheet, StatusGlyph, gradeOf, pct } from "@/components/kit";
import type { Candidate, RunManifest, Verdict } from "@/lib/foundry/types";

import { fileUrl } from "./foundryClient";

const STYLE_FIELDS = ["render_mode", "palette_strategy", "edge_treatment", "black_handling"];

/** A section's whole verdict as one mark. The thresholds are ScoreChip's (kit),
 *  so a panel header and the chips inside it cannot disagree about what a number
 *  means, and the per-field diff below stays exactly where the audit happens. */
function GradeMark({ what, score }: { what: string; score: number | null | undefined }) {
  const g = gradeOf(score);
  const word = g === "held" ? "held" : g === "partial" ? "partly held" : g === "missed" ? "did not hold" : "not graded";
  return (
    <>
      <Magnitude value={score} />
      <span className="sr-only">
        {what}: {word}
      </span>
    </>
  );
}

export function Lightbox({
  run,
  candidate,
  verdict,
  readOnly,
  onClose,
  onVerdict,
  onStep,
  index,
  count,
}: {
  run: RunManifest;
  candidate: Candidate | null;
  verdict: Verdict | undefined;
  readOnly: boolean;
  onClose: () => void;
  onVerdict: (v: Verdict | null) => void;
  onStep: (d: 1 | -1) => void;
  /** Position of the open candidate in the run, for the ends of the arrows. */
  index: number;
  count: number;
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
    <Sheet
      open={Boolean(candidate)}
      onClose={onClose}
      title={candidate ? `${style?.name ?? candidate.style} · ${candidate.mechanism}` : ""}
      eyebrow={candidate ? <Kicker>{candidate.id}</Kicker> : undefined}
      onPrev={index > 0 ? () => onStep(-1) : undefined}
      onNext={index < count - 1 ? () => onStep(1) : undefined}
      prevLabel="Previous candidate"
      nextLabel="Next candidate"
      footer={
        <>
          {readOnly ? (
            <span className="k-vword">committed · verdicts are final</span>
          ) : (
            <KeyRow
              label="Comparison shortcuts"
              map={[
                { keys: ["←", "→"], does: "step" },
                { keys: ["K"], does: "keep" },
                { keys: ["X"], does: "reject" },
                { keys: ["U"], does: "clear" },
                { keys: ["Esc"], does: "close" },
              ]}
            />
          )}
          {!readOnly && (
            <span className="k-dock__r">
              <span className={`k-vword${verdict === "keep" ? " k-vword--k" : verdict === "reject" ? " k-vword--x" : ""}`}>
                {verdict === "keep" ? "kept" : verdict === "reject" ? "rejected" : "undecided"}
              </span>
              {verdict && (
                <Button variant="ghost" onClick={() => onVerdict(null)}>
                  Clear
                </Button>
              )}
              <Button variant="reject" aria-pressed={verdict === "reject"} onClick={() => onVerdict("reject")}>
                {verdict === "reject" ? "Rejected ✓" : "Reject"}
              </Button>
              <Button variant="keep" aria-pressed={verdict === "keep"} onClick={() => onVerdict("keep")}>
                {verdict === "keep" ? "Kept ✓" : "Keep"}
              </Button>
            </span>
          )}
        </>
      }
    >
      {candidate && scene && (
        <div className="k-pbody">
          <div className="k-pairs">
            <figure className="k-pfig">
              <Plate>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(run.id, scene.source)} alt="source" />
              </Plate>
              <figcaption>
                <span className="k-caps">source · {scene.id}</span>
              </figcaption>
            </figure>
            <figure className="k-pfig">
              <Plate>
                <div className={`k-cand${verdict ? ` k-cand--${verdict}` : ""}`}>
                  {candidate.deleted ? (
                    <div className="k-noimg k-caps">
                      <StatusGlyph kind="reject" decorative size={44} />
                      deleted
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fileUrl(run.id, candidate.file)} alt={candidate.id} style={{ display: "block", width: "100%" }} />
                  )}
                </div>
              </Plate>
              <figcaption>
                <span className="k-caps">
                  candidate · {candidate.mechanism} · seed {candidate.seed}
                </span>
                <span>
                  {verdict && <StatusGlyph kind={verdict} label={verdict === "keep" ? "kept" : "rejected"} />}
                  {candidate.timings?.generate_s ? ` ${candidate.timings.generate_s}s` : ""}
                </span>
              </figcaption>
            </figure>
          </div>

          {g ? (
            <div className="k-grades">
              <div className="k-gp">
                <div className="k-gph">
                  <span className="k-caps">shot · craft fidelity</span>
                  <span className="k-gph__v">
                    <GradeMark what="craft fidelity" score={g.craft?.score} />
                    {pct(g.craft?.score)}
                  </span>
                </div>
                <DataTable
                  head={["field", "source", "candidate"]}
                  rows={Object.entries(g.craft?.per_field ?? {}).map(([f, v]) => [
                    f.replace(/_/g, " "),
                    String(scene.annotation?.[f] ?? "—"),
                    <Credit key={f} value={v}>
                      {String(g.craft?.annotation?.[f] ?? "—")}
                    </Credit>,
                  ])}
                />
              </div>

              <div className="k-gp">
                <div className="k-gph">
                  <span className="k-caps">look · style adherence</span>
                  <span className="k-gph__v">
                    <GradeMark what="style adherence" score={g.style?.score} />
                    {pct(g.style?.score)}
                  </span>
                </div>
                <DataTable
                  head={["field", "wanted", "candidate"]}
                  rows={[
                    ...STYLE_FIELDS.map((f) => {
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
                {g.style?.readback?.depiction && <p className="k-quote">“{g.style.readback.depiction}”</p>}
                {g.unmeasured.length > 0 && (
                  <Chips>
                    <Chip tone="gold" wrap>
                      unmeasured: {g.unmeasured.join(" · ")}
                    </Chip>
                  </Chips>
                )}
                <p className="k-small">graded by {g.grader}</p>
              </div>
            </div>
          ) : (
            <p className="k-small">
              <Chip tone="gold">not graded</Chip>
            </p>
          )}

          {candidate.prompt && (
            <details className="k-fold">
              <summary className="k-caps">prompt</summary>
              <pre>{candidate.prompt}</pre>
            </details>
          )}
        </div>
      )}
    </Sheet>
  );
}
