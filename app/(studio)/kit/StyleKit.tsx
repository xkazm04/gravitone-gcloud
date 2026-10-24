"use client";

// THE STYLE ATELIER'S PARTS (Phase 5, L51): the proof sheet, the trial matrix, the ratchet, the
// palette, the evidence table, the exemplar strip and the four slots - drawn here over literal
// data in each state the atelier meets (undecided, approved, rejected with its note, approved
// under an earlier block; a gate held, open, locked). The prototype draws a style only inside the
// Library's detail (library.js `body` for kind style: Evidence tallies + .evt, Recipe, Plates),
// so those three keep its values and the rest are kit tokens set beside them. The pictures are
// the presets' tracked plates (public/presets/*.jpg): the trial grid under public/trials is
// gitignored, so every trial lands this style's one picture, as the atelier's fixture does.
// Nothing a control does here leaves the specimen.

import { useState } from "react";

import type { BlobRef } from "@gt/domain/blob";
import { STYLE_TRIALS } from "@gt/domain/style.ratchet";
import type { ProofState, StyleCoverageRow, StyleEvidenceRow, StyleExemplarView, StyleLockGate, StyleProofView } from "@gt/domain/styleView";
import { LockGate } from "@gt/ui/components/style/LockGate.tsx";
import { ProofSheet, type ProofNoting } from "@gt/ui/components/style/ProofSheet.tsx";
import { EvidenceTable, Palette, PlateStrip } from "@gt/ui/components/style/StyleFacts.tsx";
import { StyleSlots } from "@gt/ui/components/style/StyleSlots.tsx";
import { TrialMatrix } from "@gt/ui/components/style/TrialMatrix.tsx";

import { Row, Section, Spec } from "./Spec.tsx";

// A specimen's blob is its public file: the sha is the file's index in this list (a stand-in
// key), the address the committed plate.
const PLATE = "/presets/newsprint-cutout.jpg";
const FILES: readonly string[] = [
  PLATE,
  "/presets/data-neon.jpg",
  "/presets/signal-ledger.jpg",
  "/presets/chalk-argument.jpg",
];
const ref = (file: string): BlobRef => ({ sha256: FILES.indexOf(file).toString(16).padStart(64, "0"), bytes: 1, mime: "image/jpeg" });
const srcOf = (r: BlobRef): string => FILES[Number.parseInt(r.sha256, 16)] ?? "";
const plate = (_trial: string): BlobRef => ref(PLATE);

const AT = "2026-09-02T09:40:00.000Z";
const P = (id: string, trialId: string, state: ProofState, extra: Partial<StyleProofView> = {}): StyleProofView => {
  const t = STYLE_TRIALS.find((x) => x.id === trialId);
  return { id, label: t?.label ?? trialId, media: plate(trialId), state, trialId, ...(t === undefined ? {} : { problem: t.problem }), lineage: "current", provider: "google", model: "gemini-3.1-flash-image", costUsd: 0.045, at: AT, ...extra };
};
const PROOFS: readonly StyleProofView[] = [
  P("k-fall", "peak-and-fall", "approved"),
  P("k-wish", "wish-list", "approved"),
  P("k-booking", "booking-not-meal", "pending"),
  P("k-flywheel", "flywheel", "rejected", { note: "the arrows lost their cut paper edge" }),
  P("k-exit", "the-exit", "approved", { lineage: "stale" }),
];
const COVERAGE: readonly StyleCoverageRow[] = ["quantity", "inventory", "analogy", "mechanism", "flow"].map((problem, i) => ({
  problem,
  trialIds: [STYLE_TRIALS[i]?.id ?? problem],
  approved: i < 2 ? 1 : 0,
  rejected: i === 3 ? 1 : 0,
  covered: i < 2,
}));
const SHEET = { approved: 3, pending: 1, rejected: 1, cap: 14, spend: { usd: 0.18, unpriced: 1 } };
const PALETTE = [
  { name: "deep navy", hex: "#1F2A44", role: "ground" as const },
  { name: "bone cream", hex: "#F2EAD9", role: "objects" as const },
  { name: "signal coral", hex: "#FF6F61", role: "accent" as const },
];
const EVIDENCE: readonly StyleEvidenceRow[] = [
  { run: "2026-08-26-dry-run", scene: "wow-archer", mechanism: "text", verdict: "keep", at: AT, by: "operator", counts: true },
  { run: "2026-08-26-sweep-01", scene: "lotr-cavalry", mechanism: "ref-early", verdict: "keep", at: AT, by: "operator", counts: true },
  { run: "2026-08-26-sweep-01", scene: "sw-doorway", mechanism: "text", verdict: "reject", at: AT, by: "operator", counts: false },
  { run: "2026-08-26-sweep-01", scene: "arcane-standoff", mechanism: "text", verdict: "keep", at: AT, by: "agent", counts: false },
];
const EXEMPLARS: readonly StyleExemplarView[] = [
  { role: "source", media: ref("/presets/data-neon.jpg"), run: "2026-08-27-artstyle-train", abandoned: false },
  { role: "replica", media: ref("/presets/signal-ledger.jpg"), run: "2026-08-27-artstyle-train", settled: "target-met", abandoned: false },
  { role: "replica", media: ref("/presets/chalk-argument.jpg"), run: "2026-08-27-artstyle-train", settled: "no-usable-fix", abandoned: true },
];
const HELD: StyleLockGate = { can: false, blocker: "approve 1 more problem — 2 of 3 covered; missing analogy, mechanism, flow (1 approved under an earlier block no longer count)", legacySheet: false };

function SheetSpecimen() {
  const [proofs, setProofs] = useState(PROOFS);
  const [held, setHeld] = useState<string | null>("k-booking");
  const [noting, setNoting] = useState<ProofNoting | null>(null);
  const judge = (id: string, state: ProofState): void => {
    if (state === "rejected") return setNoting({ id, note: "" });
    setProofs((all) => all.map((p) => (p.id === id ? { ...p, state } : p)));
  };
  const attach = (): void => {
    if (noting === null || noting.note.trim() === "") return;
    setProofs((all) => all.map((p) => (p.id === noting.id ? { ...p, state: "rejected", note: noting.note.trim() } : p)));
    setNoting(null);
  };
  return (
    <Spec names={["ProofSheet", "ProofTile"]} source="style/ProofSheet.tsx · v1 app/library/parts.tsx StyleSheet + ProofThumb" wide>
      <ProofSheet
        proofs={proofs}
        sheet={SHEET}
        srcOf={srcOf}
        held={held}
        onHold={setHeld}
        onJudge={judge}
        noting={noting}
        onNote={(note) => setNoting((n) => (n === null ? n : { ...n, note }))}
        onAttach={attach}
        onCancelNote={() => setNoting(null)}
        busy={false}
      />
    </Spec>
  );
}

function MatrixSpecimen() {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set(["booking-not-meal"]));
  const toggle = (id: string): void =>
    setChosen((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <Spec names={["TrialMatrix"]} source="style/TrialMatrix.tsx · v1 app/library/TrialMatrix.tsx + parts.tsx coverage pips" wide>
      <TrialMatrix trials={STYLE_TRIALS} coverage={COVERAGE} proofs={PROOFS} srcOf={srcOf} chosen={chosen} onChoose={toggle} />
    </Spec>
  );
}

export function StyleSection() {
  const [block, setBlock] = useState({ technique: "paper collage — grayscale photographic cutouts on flat colour fields", subject: "subjects cut out with visible torn edges", palette: PALETTE, finish: "paper grain, hard offset shadows, halftone at 30%" });
  return (
    <Section id="style">
      <SheetSpecimen />
      <MatrixSpecimen />
      <Spec names={["LockGate"]} source="style/LockGate.tsx · v1 parts.tsx StyleStepper + SpecEditor blocker">
        <Row label="candidate">
          <LockGate status="candidate" why="operator keeps in 1 of 2 cells — approvals on trial problems count" keptCells={1} provenKeeps={2} coverage={COVERAGE.map((c, i) => ({ ...c, approved: i === 0 ? 1 : 0, covered: i === 0 }))} lockProblems={3} lock={{ can: false, blocker: "1 proof still undecided", legacySheet: false }} />
        </Row>
        <Row label="held">
          <LockGate status="proven" why={HELD.blocker ?? ""} keptCells={3} provenKeeps={2} coverage={COVERAGE} lockProblems={3} lock={HELD} />
        </Row>
        <Row label="locked">
          <LockGate status="locked" why="locked — projects build on this block" keptCells={4} provenKeeps={2} coverage={COVERAGE.map((c) => ({ ...c, approved: 1, covered: true }))} lockProblems={3} lock={{ can: false, blocker: null, legacySheet: false, lockedAt: "2026-08-20T11:30:00.000Z", lockedBy: "operator" }} />
        </Row>
      </Spec>
      <Spec names={["StyleSlots"]} source="style/StyleSlots.tsx · v1 SpecEditor + Playground slots">
        <Row label="draft">
          <StyleSlots block={block} locked={false} busy={false} onCommit={setBlock} />
        </Row>
        <Row label="locked">
          <StyleSlots block={block} locked busy={false} onCommit={() => undefined} />
        </Row>
      </Spec>
      <Spec names={["Palette"]} source="style/StyleFacts.tsx · v1 parts.tsx PaletteDots">
        <Palette palette={PALETTE} />
      </Spec>
      <Spec names={["EvidenceTable"]} source="style/StyleFacts.tsx · library.js style detail .evt">
        <EvidenceTable rows={EVIDENCE} />
      </Spec>
      <Spec names={["PlateStrip"]} source="style/StyleFacts.tsx · v1 StylesShelf document plates">
        <PlateStrip exemplars={EXEMPLARS} srcOf={srcOf} />
      </Spec>
    </Section>
  );
}
