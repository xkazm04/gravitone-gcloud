// GET /api/imaging/pricing — the price table, and nothing else.
//
// WHY A ROUTE FOR A CONSTANT. `lib/imaging/pricing.ts` is the one declaration of
// what an imaging call costs, and it is unreachable from a component: everything
// under `lib/imaging/` reads API keys, so a component importing from there is
// exactly how a key reaches the browser bundle (types.ts:15-16). The result was
// that app/library/Playground.tsx carried its own `0.045` beside a comment
// naming this route as the fix. A price declared twice is a price that rots —
// one of the two copies is always the stale one, and nothing tells you which.
//
// ── WHAT THIS RESPONSE MAY CARRY (audited before the first byte was served) ──
//
// The body is `priceTable()` verbatim, and that function is derived from the
// module constant `PRICES` alone. So, exactly:
//
//   EXPOSED   provider ids, model ids as they appear in the price table, the
//             USD-per-image figures, the `image_size` each was measured at, the
//             billing unit, the prose `source` for each row, the date it was
//             checked, and one derived pre-click estimate (the dearest declared
//             per-image rate, labelled `estimated`).
//             All of it is a literal in a file that is committed to this repo.
//             Serving it tells a caller nothing they could not read in git.
//
//   NOT EXPOSED, and by construction rather than by filtering:
//     · No API key, and no fragment or length or hash of one. `pricing.ts`
//       imports nothing that reads a key — its only import is `import type`,
//       which is erased.
//     · No environment. Not `IMAGING_ENV`, not `NODE_ENV`, not `currentEnv()`.
//     · No key STATE. `isConfigured()` is never called, so the response is byte
//       for byte identical on a box with three keys and a box with none. A
//       caller cannot infer which vendors this deployment can actually reach.
//     · No routing plan. `planFor()` is never called — it varies by environment,
//       which would leak the environment.
//     · No operator model overrides. GOOGLE_IMAGE_MODEL / GOOGLE_VISION_MODEL /
//       GOOGLE_IMAGE_SIZE are read in providers/google.ts and nowhere near this
//       route; the model ids here are the table's own literals, so an operator
//       who has pinned a different model is not disclosed by this response.
//     · Nothing per-request. The handler ignores the Request entirely, so there
//       is no input a caller could vary to widen the answer.
//
// The two ways this audit could quietly stop being true are (a) `pricing.ts`
// growing a value import from elsewhere in `lib/imaging/`, and (b) the row
// projection in `priceTable()` becoming a spread. Both are guarded in comments
// where they would happen, and the offline half of pipeline/integration-imaging.mts
// asserts the response against the key values it holds.
//
// NOT a pricing API for third parties, and not cached infrastructure: the table
// is a module constant and a plain response is the whole implementation.

import { priceTable } from "@/lib/imaging/pricing";

export const runtime = "nodejs";

export function GET(): Response {
  return Response.json(priceTable());
}
