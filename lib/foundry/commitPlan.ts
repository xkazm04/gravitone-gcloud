// SERVER COMMIT PLAN — pure planning and token generation for forge & extract commits.
//
// Shared by store.ts / extract/store.ts and the preview API routes.
//
// A commit plan computes:
//   - exact counts (kept, deleted, undecided)
//   - candidate file deletion list
//   - projected ledger rows & style promotions (forge)
//   - projected style ID renames & near-duplicate warnings (extract)
//   - an integrity token binding the preview to the eventual commit

import { createHash } from "node:crypto";

import type {
  Catalogue,
  Evidence,
  ForgeCommitPlan,
  LedgerRow,
  RunManifest,
  StyleDef,
  Verdict,
  Verdicts,
} from "./types";
import type {
  ExtractCommitPlan,
  ExtractManifest,
  ExtractRename,
  ExtractVerdicts,
  Observables,
} from "./extract/types";
import { nearDuplicates } from "./extract/vocabulary";

/**
 * Pure projection of what `commitRun` will do to the filesystem and catalogue.
 */
export function planForgeCommit(
  run: RunManifest,
  verdicts: Verdicts,
  catalogue: Catalogue,
  undecidedAs: "reject" | "leave",
): ForgeCommitPlan {
  const withFile = run.candidates.filter(
    (c) => c.status !== "pending" && c.status !== "failed" && !c.deleted,
  );

  const effectiveVerdicts: Verdicts = { ...verdicts };
  if (undecidedAs === "reject") {
    for (const c of withFile) {
      if (!effectiveVerdicts[c.id]) {
        effectiveVerdicts[c.id] = { verdict: "reject", at: "" };
      }
    }
  }

  const decided = withFile.filter((c) => effectiveVerdicts[c.id]);
  const undecided = withFile.length - decided.length;

  const deleteFiles: string[] = [];
  let deleted = 0;
  let kept = 0;

  for (const c of decided) {
    if (effectiveVerdicts[c.id].verdict === "reject") {
      deleted++;
      if (c.file) deleteFiles.push(c.file);
      if (c.sidecar) deleteFiles.push(c.sidecar);
    } else {
      kept++;
    }
  }

  const ledgerRows: LedgerRow[] = decided.map((c) => ({
    run: run.id,
    scene: c.scene,
    style: c.style,
    mechanism: c.mechanism,
    seed: c.seed,
    verdict: effectiveVerdicts[c.id].verdict as Verdict,
    craft: c.grade?.craft?.score ?? null,
    style_score: c.grade?.style?.score ?? null,
    has_text: c.grade?.veto?.has_text ?? null,
    at: effectiveVerdicts[c.id].at || "",
  }));

  const promotions: string[] = [];
  const evidence: Record<string, Evidence[]> = {};

  for (const s of catalogue.styles) {
    evidence[s.id] = [];
    const prevKeptScenes = new Set(
      (s.evidence ?? [])
        .filter((e) => e.run !== run.id && e.verdict === "keep")
        .map((e) => `${e.run}/${e.scene}`),
    );
    const newKeptScenes = new Set(
      decided
        .filter((c) => c.style === s.id && effectiveVerdicts[c.id]?.verdict === "keep")
        .map((c) => `${run.id}/${c.scene}`),
    );
    for (const c of decided.filter((c) => c.style === s.id)) {
      evidence[s.id].push({
        run: run.id,
        scene: c.scene,
        mechanism: c.mechanism,
        verdict: effectiveVerdicts[c.id].verdict as Verdict,
        at: effectiveVerdicts[c.id].at || "",
      });
    }
    const combinedKeptScenes = new Set([...prevKeptScenes, ...newKeptScenes]);
    if (s.status !== "proven" && combinedKeptScenes.size >= 2) {
      promotions.push(s.id);
    }
  }

  const verdictPayload = Object.keys(verdicts)
    .sort()
    .map((k) => `${k}:${verdicts[k]?.verdict}`)
    .join("|");
  const candidatePayload = run.candidates
    .map((c) => `${c.id}:${c.status}:${c.deleted ? 1 : 0}:${c.file}`)
    .join("|");
  const cataloguePayload = catalogue.styles
    .map((s) => `${s.id}:${s.status}:${s.evidence?.length ?? 0}`)
    .join("|");

  const token = createHash("sha256")
    .update(`${run.id}:${run.status}:${undecidedAs}:${verdictPayload}:${candidatePayload}:${cataloguePayload}`)
    .digest("hex");

  return {
    counts: { kept, deleted, undecided },
    delete: deleteFiles,
    ledgerRows,
    evidence,
    promotions,
    token,
  };
}

/**
 * Pure projection of what `commitExtractRun` will write to the style catalogue.
 */
export function planExtractCommit(
  run: ExtractManifest,
  verdicts: ExtractVerdicts,
  catalogue: { styles: StyleDef[] },
): ExtractCommitPlan {
  // Replace styles from own run on retry rather than colliding with own suffix
  const catalogueStyles = (catalogue.styles ?? []).filter((s) => s.origin?.source !== run.id);
  const taken = new Set(catalogueStyles.map((s) => s.id));

  const kept = run.styles.filter((s) => verdicts[s.id]?.verdict === "keep");
  const rejected = run.styles
    .filter((s) => verdicts[s.id]?.verdict === "reject")
    .map((s) => s.id);
  const undecided = run.styles
    .filter(
      (s) =>
        !verdicts[s.id] ||
        (verdicts[s.id].verdict !== "keep" && verdicts[s.id].verdict !== "reject"),
    )
    .map((s) => s.id);

  const written: ExtractRename[] = [];
  for (const s of kept) {
    let cid = s.id;
    for (let i = 2; taken.has(cid); i++) cid = `${s.id}-${i}`;
    taken.add(cid);
    written.push({ from: s.id, to: cid });
  }

  const similar: Record<string, string[]> = {};
  for (const s of kept) {
    similar[s.id] = [];
    const comparePool = [
      { id: s.id, observables: s.observables },
      ...catalogueStyles.map((cs) => ({ id: cs.id, observables: cs.observables as Observables })),
    ];
    const dupes = nearDuplicates(comparePool);
    for (const [idA, idB] of dupes) {
      if (idA === s.id && idB !== s.id && !similar[s.id].includes(idB)) {
        similar[s.id].push(idB);
      } else if (idB === s.id && idA !== s.id && !similar[s.id].includes(idA)) {
        similar[s.id].push(idA);
      }
    }
  }

  const verdictPayload = Object.keys(verdicts)
    .sort()
    .map((k) => `${k}:${verdicts[k]?.verdict}`)
    .join("|");
  const cataloguePayload = catalogueStyles
    .map((s) => `${s.id}:${JSON.stringify(s.observables)}`)
    .join("|");

  const token = createHash("sha256")
    .update(`${run.id}:${run.status}:${verdictPayload}:${cataloguePayload}`)
    .digest("hex");

  return {
    counts: { kept: kept.length, rejected: rejected.length, undecided: undecided.length },
    written,
    similar,
    rejected,
    undecided,
    token,
  };
}
