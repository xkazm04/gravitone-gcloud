// THE STYLE-REFERENCE STABILITY REGRESSION — the master may not walk away.
//
//   node pipeline/style-ref-stability.mts
//
// Every plate and every alternative is generated against `styleRefs(style)` and
// never against a sibling plate's output. That is a STAR: each frame hangs off one
// master, so no frame's error can reach another, and a sheet of thirty frames sits
// exactly as close to the master as a sheet of three.
//
// The star's guarantee is worth exactly as much as the master's stability, and a
// pure newest-first window has none. Measured on 2026-09-04, before PINNED_REFS
// existed: over a sheet proofed to PROOF_CAP, the founding proof left the reference
// set at approval 5 of 14 and never returned.
//
// REPOINTED (Phase 5 L48): the window moved from lib/themes.ts into
// @gt/domain/style.ratchet with the Style store; tests/next-server/style-ratchet-v1.test.ts
// holds v1's copy equal until it retires.

import { PINNED_REFS, PROOF_CAP, SEND_REFS, styleRefs } from "../packages/domain/src/style.ratchet.ts";

const failures: string[] = [];
const check = (name: string, ok: boolean, detail: string): void => {
  if (!ok) failures.push(`${name} — ${detail}`);
};

const sha = (n: number): string => n.toString(16).padStart(64, "0");
const sheetOf = (n: number) => ({
  proofs: Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    label: `p${i + 1}`,
    media: { sha256: sha(i + 1), bytes: 1, mime: "image/png" },
    state: "approved" as const,
    at: new Date(Date.UTC(2026, 9, 17, 9, 0, i)).toISOString(),
  })),
});
const ids = (n: number): string[] => styleRefs(sheetOf(n)).map((r) => `proof-${parseInt(r.sha256, 16)}`);

check("pinned portion is strictly smaller than the window", PINNED_REFS < SEND_REFS, `PINNED_REFS=${PINNED_REFS} must be < SEND_REFS=${SEND_REFS}`);
check("rolling portion is at least one slot wide", SEND_REFS - PINNED_REFS >= 1, `SEND_REFS-PINNED_REFS=${SEND_REFS - PINNED_REFS} must be >= 1`);
const full = ids(PROOF_CAP);
check("the founding proof survives a full sheet", full.includes("proof-1"), `at PROOF_CAP=${PROOF_CAP} the references are [${full.join(", ")}]`);
check("the newest approval reaches the model", full.includes(`proof-${PROOF_CAP}`), `the newest of ${PROOF_CAP} approvals is absent from [${full.join(", ")}]`);
check("the window is capped", full.length === SEND_REFS, `sent ${full.length} references, SEND_REFS=${SEND_REFS}`);
check("an unproofed style sends no references", ids(0).length === 0, "a style with no approved proof produced references");
for (let n = Math.max(1, PINNED_REFS); n <= PROOF_CAP; n++) {
  const got = ids(n);
  if (!got.includes("proof-1")) {
    check("the founding proof holds at every sheet size", false, `it is missing at ${n} approval(s): [${got.join(", ")}]`);
    break;
  }
}

if (failures.length) {
  console.error(`style-ref stability: ${failures.length} failure(s)\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`style-ref stability: ok — the founding proof holds through PROOF_CAP=${PROOF_CAP} with SEND_REFS=${SEND_REFS}, PINNED_REFS=${PINNED_REFS}`);
