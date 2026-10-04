// THE STYLE-REFERENCE STABILITY REGRESSION — the master may not walk away.
//
//   npx tsx pipeline/style-ref-stability.mts
//
// Every plate and every alternative is generated against `styleRefs(theme)` and
// never against a sibling plate's output (useFrames.ts:142, useAlternatives.ts).
// That is a STAR: each frame hangs off one master, so no frame's error can
// reach another, and a sheet of thirty frames sits exactly as close to the
// master as a sheet of three.
//
// The star's guarantee is worth exactly as much as the master's stability, and
// a pure newest-first window has none. Measured on 2026-09-04, before
// PINNED_REFS existed: over a sheet proofed to PROOF_CAP, the founding proof
// left the reference set at approval 5 of 14 and never returned — the last
// frames of a sheet were judged against four references sharing nothing with
// the four the theme was founded on, and nothing recorded which frame saw
// which master.
//
// Pinning does not make the master STILL — the rolling half still moves on
// every approval, and this file does not pretend otherwise. What it fixes is
// ORIGIN LOSS, which is the half that silently rewrites what the theme means.

import { styleRefs, SEND_REFS, PROOF_CAP, PINNED_REFS, type Theme, type Proof } from "../lib/themes";

const failures: string[] = [];
const check = (name: string, ok: boolean, detail: string) => {
  if (!ok) failures.push(`${name} — ${detail}`);
};

const proof = (n: number): Proof =>
  ({ id: `p${n}`, state: "approved", base64: `proof-${n}`, mime: "image/png", createdAt: 1_000 + n }) as unknown as Proof;
const themeOf = (n: number): Theme =>
  ({ proofs: Array.from({ length: n }, (_, i) => proof(i + 1)) }) as unknown as Theme;
const ids = (t: Theme) => styleRefs(t).map((r) => r.base64);

// The bounds a partly-pinned window needs, asserted rather than assumed. Pin
// everything and the sheet stops responding to what was just approved; leave no
// rolling slot and the window cannot advance at all.
check("pinned portion is strictly smaller than the window", PINNED_REFS < SEND_REFS, `PINNED_REFS=${PINNED_REFS} must be < SEND_REFS=${SEND_REFS}`);
check("rolling portion is at least one slot wide", SEND_REFS - PINNED_REFS >= 1, `SEND_REFS-PINNED_REFS=${SEND_REFS - PINNED_REFS} must be >= 1`);

// The founding proof is what every early frame in the sheet was judged against.
// It survives to a full sheet, or the late frames are minted against a theme
// the early ones never saw.
const full = themeOf(PROOF_CAP);
check("the founding proof survives a full sheet", ids(full).includes("proof-1"), `at PROOF_CAP=${PROOF_CAP} the references are [${ids(full).join(", ")}]`);

// The window still advances: the newest approval reaches the model.
check("the newest approval reaches the model", ids(full).includes(`proof-${PROOF_CAP}`), `the newest of ${PROOF_CAP} approvals is absent from [${ids(full).join(", ")}]`);

// The window is never over-filled, and a theme with nothing approved sends
// nothing rather than a pending proof.
check("the window is capped", ids(full).length === SEND_REFS, `sent ${ids(full).length} references, SEND_REFS=${SEND_REFS}`);
check("an unproofed theme sends no references", styleRefs(themeOf(0)).length === 0, "a theme with no approved proof produced references");

// Growth is monotone in the pinned half: once pinned, always pinned.
for (let n = Math.max(1, PINNED_REFS); n <= PROOF_CAP; n++) {
  const got = ids(themeOf(n));
  if (!got.includes("proof-1")) {
    check(`the founding proof holds at every sheet size`, false, `it is missing at ${n} approval(s): [${got.join(", ")}]`);
    break;
  }
}

if (failures.length) {
  console.error(`style-reference stability FAILED — ${failures.length} check(s):`);
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log(`style-reference stability OK — ${PINNED_REFS} pinned + ${SEND_REFS - PINNED_REFS} rolling; the founding proof survives a ${PROOF_CAP}-proof sheet.`);
