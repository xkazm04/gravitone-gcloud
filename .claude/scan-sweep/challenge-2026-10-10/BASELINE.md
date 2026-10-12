# Baseline at b08bc7e + foreign working tree (2026-10-10)
- typecheck: exit 2 - 14 x TS2459 in app/foundry/pipeline/PipelineCanvas.tsx (foreign, uncommitted split into tunables.ts/canvasTypes.ts/useAudition.ts)
- lint:ratchet: exit 1 - PipelineCanvas.tsx:41 no-unused-vars 'EASE' (same foreign edit)
- npm test: exit 1 - 1881 passed, 1 skipped, 1 failed: kit-catalog.probe.spec.ts:191 census stale, delta confined to app/foundry (files 608->611)
Rule for builders: a red gate whose failing paths are ONLY the above is not yours. Compare failing paths; anything else is yours.

# After wave 1 (HEAD at wave-2 start)
- typecheck 0, lint:ratchet 0 (exhaustive-deps lowered 1->0, edcee8a), census regenerated.
- npm test: 1932 passed, 1 FOREIGN failure: identity-and-writes.probe.spec.ts:137 - app/foundry/pipeline/arm.ts (concurrent canvas session, cb01fd4) writes localStorage unlisted. Not yours.
- Kit census: if YOUR new tracked files make it stale, say so in notes; do not regenerate.
