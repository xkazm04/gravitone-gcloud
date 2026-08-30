// GET /api/music/pricing — the music price table, and nothing else.
//
// WHY A ROUTE FOR A CONSTANT. `lib/music/pricing.ts` is the one declaration of
// what a music call costs, and it is unreachable from a component: everything
// under `lib/music/` sits behind the seam that keeps ELEVENLABS_API_KEY out of
// the browser bundle, so a component importing from there is exactly how a key
// escapes. The Score surface needs the figure BEFORE the click — music is the
// only engine in this product that spends on one click from a product surface —
// and a price restated in a component is a price that rots. This is the same
// route, for the same reason, as GET /api/imaging/pricing.
//
// ── WHAT THIS RESPONSE MAY CARRY (audited before the first byte was served) ──
//
// The body is `priceTable()` verbatim, and that function is derived from the
// module constant `MUSIC_PRICES` alone. So, exactly:
//
//   EXPOSED   the vendor id, the four operation names, the model ids as they
//             appear in the table, the credits-per-second and USD-per-credit
//             figures (today: one declared zero and three deliberate absences),
//             the prose `source` for each row, the date each was checked, and
//             one derived per-second quote.
//             All of it is a literal in a file committed to this repo. Serving
//             it tells a caller nothing they could not read in git.
//
//   NOT EXPOSED, by construction rather than by filtering:
//     · No API key, and no fragment, length or hash of one. `pricing.ts`
//       imports nothing that reads a key — its only import is `import type`,
//       which is erased.
//     · No key STATE. `isMusicConfigured()` is never called, so the response is
//       byte for byte identical on a box with a key and a box without one. A
//       caller cannot learn whether this deployment can reach ElevenLabs.
//     · No environment, and NO BUDGET. `lib/music/budget.ts` reads
//       MUSIC_BUDGET_SECONDS_PER_WINDOW and is deliberately not imported here:
//       the ceiling an operator set is operator configuration, and a price
//       response is not the place to disclose it. A caller learns about the
//       ceiling the one way that is theirs to know — by being refused by it,
//       with the reason in the 402.
//     · Nothing per-request. The handler ignores the Request entirely, so there
//       is no input a caller could vary to widen the answer.
//
// The two ways this audit could quietly stop being true are (a) `pricing.ts`
// growing a value import from elsewhere in `lib/music/`, and (b) the row
// projection in `priceTable()` becoming a spread. Both are guarded in comments
// where they would happen.
//
// UNGATED, unlike its money-spending siblings: there is no secret here and no
// spend, and the Score surface needs it on first paint.

import { priceTable } from "@/lib/music/pricing";

export const runtime = "nodejs";

export function GET(): Response {
  return Response.json(priceTable());
}
