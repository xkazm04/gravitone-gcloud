// LANE — THE STYLE LOCK IS A ONE-WAY RATCHET (dynamic).
//
// Registry: visual-style-locking / draft-proofing-locked-ratchet.
//
// The technique's hard rules are two: nothing unlocks, and editing a locked
// style IN PLACE voids every approval on its sheet and orphans every frame
// generated against it. lib/themes.ts reasons from the first one out loud —
// `projectStyle` says "a theme that exists but is no longer locked is not a case
// here: the lock is a one-way ratchet (nothing clears `lockedAt`)", which is what
// lets every consumer not handle that state.
//
// It was true and it was held in a VIEW. `useThemes.update` takes a
// `Partial<Theme>` and commits it to any theme; what stopped a locked style being
// edited was SpecEditor computing `locked` for itself and rendering its slots
// read-only, plus StyleSheet disabling rename. Two presentational components
// holding an invariant the data layer reasons from.
//
// These cases drive the rule where it now lives — a pure function of the record
// and the patch, so the next surface inherits the refusal instead of having to
// remember it.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect } from "@playwright/test";

import {
  canLock,
  lockBlocker,
  newTheme,
  projectStyle,
  ratchetBlocker,
  statusOf,
  type Proof,
  type Theme,
} from "@/lib/themes";

/** A real Proof, not a cast — the fields are the record's, so a field added to
 *  Proof breaks this fixture rather than being silently absent from it. */
const proof = (id: string, state: Proof["state"]): Proof => ({
  id,
  label: `proof ${id}`,
  base64: "",
  mime: "image/png",
  state,
  createdAt: 1_700_000_000_000,
});

function draft(): Theme {
  return newTheme("u1", {
    name: "Ink Wash",
    block: { technique: "ink wash", subject: "objects", finish: "matte" },
    elements: ["card"],
  } as Parameters<typeof newTheme>[1]);
}

const locked = (): Theme => ({ ...draft(), proofs: [proof("p1", "approved")], lockedAt: 1_700_000_000_000 });

/* ── the lifecycle it guards ──────────────────────────────────────────────── */

test("status is DERIVED: draft, then proofing, then locked", () => {
  const t = draft();
  expect(statusOf(t)).toBe("draft");
  expect(statusOf({ ...t, proofs: [proof("p1", "pending")] })).toBe("proofing");
  expect(statusOf(locked())).toBe("locked");
  // A stored status would be a second source of truth; there is no field to set.
  expect("status" in (t as unknown as Record<string, unknown>)).toBe(false);
});

test("the lock gate needs an approval AND nothing undecided", () => {
  const t = draft();
  expect(canLock(t)).toBe(false);
  expect(lockBlocker(t)).toBe("generate at least one proof first");

  const pending = { ...t, proofs: [proof("p1", "approved"), proof("p2", "pending")] };
  expect(canLock(pending), "locking over a pending proof ratifies unexamined evidence").toBe(false);
  expect(lockBlocker(pending)).toContain("undecided");

  const allRejected = { ...t, proofs: [proof("p1", "rejected")] };
  expect(canLock(allRejected)).toBe(false);
  expect(lockBlocker(allRejected)).toContain("every proof was rejected");

  // A rejected proof is a DECISION, so it does not block a lock that has an
  // approval beside it.
  const mixed = { ...t, proofs: [proof("p1", "approved"), proof("p2", "rejected")] };
  expect(canLock(mixed)).toBe(true);
  expect(lockBlocker(mixed)).toBeNull();
});

/* ── the ratchet ──────────────────────────────────────────────────────────── */

test("ratchet: a draft is freely editable — the rule costs nothing before the lock", () => {
  const t = draft();
  expect(ratchetBlocker(t, { name: "Anything" })).toBeNull();
  expect(ratchetBlocker(t, { block: { ...t.block, technique: "gouache" } })).toBeNull();
  expect(ratchetBlocker(t, { lockedAt: Date.now() }), "locking is the one arrow there is").toBeNull();
});

test("ratchet: nothing unlocks", () => {
  const t = locked();
  // The state `projectStyle` is allowed to not handle. If this ever returns
  // null, that docstring becomes false and every consumer inherits a case it
  // was told could not happen.
  expect(ratchetBlocker(t, { lockedAt: undefined })).toContain("one-way");
  expect(ratchetBlocker(t, { lockedAt: 0 })).toContain("one-way");
  expect(ratchetBlocker(t, { lockedAt: Date.now() }), "re-stamping a lock is still a change").toContain("one-way");
  // And the refusal names the remedy the technique names.
  expect(ratchetBlocker(t, { lockedAt: undefined })).toContain("duplicate");
});

test("ratchet: a locked block cannot be edited in place", () => {
  const t = locked();
  const blocked = ratchetBlocker(t, { block: { ...t.block, technique: "gouache" } });
  expect(blocked, "editing in place voids every approval on the sheet").not.toBeNull();
  expect(blocked).toContain("duplicate");
  console.log(`[ratchet] refusal -> ${blocked}`);
});

test("ratchet: by VALUE, so spreading the whole record to change one field is allowed", () => {
  // A caller that does `update(id, { ...theme, name })` carries a block it never
  // touched. Refusing on PRESENCE would turn that into a false refusal, and the
  // next person would delete the guard rather than the call.
  const t = locked();
  expect(ratchetBlocker(t, { ...t, name: "Renamed" })).toBeNull();
  expect(ratchetBlocker(t, { block: { ...t.block } }), "an equal block is not a change").toBeNull();
});

test("ratchet: what a lock does NOT freeze is as deliberate as what it does", () => {
  const t = locked();
  // Promoting a plate onto a locked sheet stays allowed — a locked style's
  // plates are the most promotable of all, and an approved proof is a reference
  // for the next call rather than a change to what was ratified.
  expect(ratchetBlocker(t, { proofs: [...t.proofs, proof("p2", "approved")] })).toBeNull();
  // The name is a label, not the style. The Atelier disables renaming a locked
  // sheet as a UI choice; the record does not make that an invariant.
  expect(ratchetBlocker(t, { name: "Renamed" })).toBeNull();
});

/* ── the one resolution point ─────────────────────────────────────────────── */

test("resolution: a project's style is its OWN binding, and a miss is named", () => {
  const t = locked();
  const other = { ...locked(), id: "theme-other", name: "Other" };
  // The defect this displaces shipped once: resolving "the" style as the
  // account's most recently touched lock. With two locked styles that is wrong
  // for at least one project, always.
  expect(projectStyle([t, other], t.id)).toEqual({ theme: t, miss: null });
  expect(projectStyle([t, other], undefined)).toEqual({ theme: null, miss: "unset" });
  expect(projectStyle([t, other], "theme-gone")).toEqual({ theme: null, miss: "deleted" });
  // And it never stands another theme in — a caller that needs pixels supplies
  // its own fallback and says which miss it is covering.
  expect(projectStyle([t, other], "theme-gone").theme).toBeNull();
});

test("the rule is WIRED into the write path, not merely exported", () => {
  // Every case above passes with the guard deleted from `useThemes.update` —
  // they drive the rule, and the rule was never where the hole was. The hole was
  // that a generic `Partial<Theme>` patch reached `commit` without asking. So
  // the one thing calling a function cannot check is checked against the source:
  // that `update` consults the ratchet BEFORE it commits.
  //
  // Comments stripped first. The block above `update` names `ratchetBlocker` in
  // prose, and lib/themes.ts explains the whole rule in prose — a matcher over
  // raw text is satisfied by a file that talks about the ratchet and does not
  // ask it.
  const src = readFileSync(resolve(__dirname, "../../lib/useThemes.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  const from = src.indexOf("const update = useCallback");
  expect(from, "update() not found - this check is reading the wrong thing").toBeGreaterThan(-1);
  const body = src.slice(from, src.indexOf("const addProof", from));

  expect(body, "update() commits a patch without asking the ratchet").toMatch(/ratchetBlocker\s*\(/);
  expect(
    body.indexOf("ratchetBlocker"),
    "update() asks the ratchet only after it has already committed",
  ).toBeLessThan(body.indexOf("commit({"));
});
