// FULL-BLEED CARD SCENES — the hero card's art stops being a band at the top
// and becomes the card (operator direction, 2026-09-09).
//
// The emblem set beside this file (emblems.tsx) draws ONE motif at 48×48, in a
// 40%-tall art zone, with the title in the empty half below. That shape was
// ruled correct while the card was a picture with a caption. It is not the
// shape the create wizard's two pick stages want: three or four whole things,
// chosen cold, where the art is doing half the work of the only question on
// screen — and a small mark centred in a band leaves the rest of the card as
// dead ground.
//
// A scene is the SAME identity at poster scale: every motif here is built out
// from its emblem's own geometry (the mortarboard, the clapper, the arch, the
// aperture, the flare) rather than redrawn, so a card and its emblem read as
// two densities of one mark and nothing in the deck gains a second art
// direction. What the scene adds is FIELD — the strokes that carry the motif
// to all four edges, at a fraction of its weight, so the card is covered
// without competing with the title laid over it.
//
// Rules every scene here holds to:
//  · one `currentColor`, inherited from the family accent (emblemToneClass) —
//    no colour literal leaves components/ui/tokens.ts;
//  · strokes only, bar the occasional dot, so a scene costs nothing to draw
//    and never reads as an image that failed to load;
//  · the CENTRE is kept quiet. The title sits there, over a scrim (DeckCard's
//    hero branch), and a busy middle would fight it;
//  · nothing animates. The deck's motion is the deal and the hover lift.
//
// viewBox is 320×200 and every scene is drawn past the edges of it; the card
// slices rather than fits (`preserveAspectRatio="xMidYMid slice"`), so no
// scene may put meaning in its outer few percent.

import type { ReactNode } from "react";

/** Keys are deck-art manifest keys (`<family>-<id>`), the same vocabulary
 *  emblems.tsx uses — a card names its art once and both densities resolve. */
const SCENES: Record<string, ReactNode> = {
  /* ── disciplines ──────────────────────────────────────────────────────── */

  // The mortarboard, and the lesson written out under it.
  "discipline-educational": (
    <>
      <g opacity={0.18}>
        <path d="M-10 150 H330" />
        <path d="M-10 166 H330" />
        <path d="M-10 182 H330" />
        <path d="M20 12 C90 40 230 40 300 12" />
      </g>
      <g opacity={0.85}>
        <path d="M96 62 L160 34 L224 62 L160 90 Z" />
        <path d="M120 74 V102 C120 116 200 116 200 102 V74" />
        <path d="M224 62 V96" />
        <circle cx={224} cy={102} r={5} fill="currentColor" stroke="none" />
      </g>
      <g opacity={0.32}>
        <path d="M40 150 H128" />
        <path d="M40 166 H196" />
        <path d="M40 182 H104" />
      </g>
    </>
  ),

  // The slate, between two runs of perforation — the piece is film.
  "discipline-trailer": (
    <>
      <g opacity={0.22}>
        <path d="M-10 16 H330 M-10 38 H330" />
        <path d="M-10 162 H330 M-10 184 H330" />
        <path d="M4 22 h16 v10 h-16 Z M36 22 h16 v10 h-16 Z M68 22 h16 v10 h-16 Z M100 22 h16 v10 h-16 Z M132 22 h16 v10 h-16 Z M164 22 h16 v10 h-16 Z M196 22 h16 v10 h-16 Z M228 22 h16 v10 h-16 Z M260 22 h16 v10 h-16 Z M292 22 h16 v10 h-16 Z" />
        <path d="M4 168 h16 v10 h-16 Z M36 168 h16 v10 h-16 Z M68 168 h16 v10 h-16 Z M100 168 h16 v10 h-16 Z M132 168 h16 v10 h-16 Z M164 168 h16 v10 h-16 Z M196 168 h16 v10 h-16 Z M228 168 h16 v10 h-16 Z M260 168 h16 v10 h-16 Z M292 168 h16 v10 h-16 Z" />
      </g>
      <g opacity={0.8}>
        <path d="M74 66 H246 V142 H74 Z" />
        <path d="M74 92 H246" />
        <path d="M104 92 L118 66 M140 92 L154 66 M176 92 L190 66 M212 92 L226 66" />
      </g>
      <g opacity={0.24}>
        <path d="M246 104 L318 78 M246 116 L318 116 M246 128 L318 154" />
      </g>
    </>
  ),

  // Open frames at every size, and the play mark that is the only claim made.
  "discipline-free": (
    <>
      <g opacity={0.18}>
        <path d="M-4 44 V4 H40 M280 4 H324 V44 M324 156 V196 H280 M40 196 H-4 V156" />
        <path d="M28 74 V52 H52 M268 52 H292 V74 M292 126 V148 H268 M52 148 H28 V126" />
      </g>
      <g opacity={0.85}>
        <path d="M66 76 V54 H96 M224 54 H254 V76 M254 124 V146 H224 M96 146 H66 V124" />
        <path d="M144 82 L182 100 L144 118 Z" />
      </g>
      <g opacity={0.24}>
        <path d="M-6 128 C60 106 100 154 160 132 C220 110 262 156 326 132" />
      </g>
    </>
  ),

  /* ── templates ────────────────────────────────────────────────────────── */

  // The shard cleaved off, and the cut it left behind.
  "template-short-form-clip": (
    <>
      <g opacity={0.2}>
        <path d="M-10 156 L330 30" />
        <path d="M-10 172 L330 46" />
      </g>
      <g opacity={0.85}>
        {/* a cleaved quadrilateral, not a triangle — a right-pointing
            triangle here read as a play mark beside `discipline-free`, which
            is one (photographed 2026-09-09) */}
        <path d="M196 44 L266 84 L214 126 L180 96 Z" />
      </g>
      <g opacity={0.35}>
        <path d="M162 62 H36 M158 82 H68 M150 102 H24 M158 122 H92" />
      </g>
      <g opacity={0.18}>
        <path d="M276 60 H318 M270 140 H318" />
      </g>
    </>
  ),

  // One orb, cradled — a single idea held up and turned.
  "template-short-educational-video": (
    <>
      <g opacity={0.16}>
        <circle cx={160} cy={92} r={104} />
        <circle cx={160} cy={92} r={138} />
      </g>
      <g opacity={0.85}>
        <circle cx={160} cy={84} r={38} />
        <path d="M96 116 a 64 64 0 0 0 128 0" />
        <path d="M160 180 v-30" />
      </g>
      <g opacity={0.28}>
        <path d="M40 180 H280" />
        <path d="M124 46 a 46 46 0 0 1 72 0" />
      </g>
    </>
  ),

  // The arch that carries a whole argument, and the span under it.
  "template-mid-educational-video": (
    <>
      <g opacity={0.18}>
        <path d="M-20 156 C40 40 280 40 340 156" />
        <path d="M-10 186 H330" />
      </g>
      <g opacity={0.85}>
        <path d="M18 150 C58 46 262 46 302 150" />
        <path d="M-10 150 H330" />
        <path d="M66 150 V104 M160 150 V88 M254 150 V104" />
      </g>
      <g opacity={0.26}>
        <path d="M-10 168 H120 M148 168 H330" />
        <path d="M-10 182 H86 M112 182 H240 M268 182 H330" />
      </g>
    </>
  ),

  // The aperture barely open, and the one sliver it lets out.
  "template-teaser": (
    <>
      <g opacity={0.18}>
        <path d="M-16 62 C60 6 260 6 336 62" />
        <path d="M-16 138 C60 194 260 194 336 138" />
      </g>
      <g opacity={0.85}>
        <path d="M4 78 C70 30 250 30 316 78" />
        <path d="M4 122 C70 170 250 170 316 122" />
        <path d="M118 100 H202" />
      </g>
      <g opacity={0.3}>
        <path d="M202 100 L318 74 M202 100 L318 100 M202 100 L318 126" />
        <path d="M118 100 L2 74 M118 100 L2 100 M118 100 L2 126" />
      </g>
    </>
  ),

  // The staircase, climbed the whole width, to the portal it was built for.
  "template-trailer": (
    <>
      <g opacity={0.18}>
        <path d="M-10 190 H330" />
        <circle cx={252} cy={56} r={54} />
      </g>
      <g opacity={0.85}>
        <path d="M-10 178 H36 V150 H82 V122 H128 V94 H174 V66 H220" />
        <circle cx={252} cy={56} r={28} />
      </g>
      <g opacity={0.28}>
        <path d="M252 4 V16 M252 96 V108 M200 56 H212 M292 56 H304" />
        <path d="M216 20 L224 28 M280 84 L288 92 M216 92 L224 84 M280 28 L288 20" />
        <path d="M36 178 V196 M82 178 V196 M128 178 V196 M174 178 V196" />
      </g>
    </>
  ),

  // The anamorphic flare, in the letterbox it only happens inside.
  "template-cinematic": (
    <>
      <g opacity={0.2}>
        <path d="M-10 26 H330 M-10 174 H330" />
        <ellipse cx={160} cy={100} rx={126} ry={30} />
        <ellipse cx={160} cy={100} rx={72} ry={17} />
      </g>
      <g opacity={0.85}>
        <path d="M-10 100 H330" />
        <ellipse cx={160} cy={100} rx={44} ry={22} />
        <path d="M160 52 V148" />
      </g>
      <g opacity={0.26}>
        <path d="M96 78 L124 100 L96 122" />
        <path d="M224 78 L196 100 L224 122" />
        <path d="M-10 40 H60 M260 160 H330" />
      </g>
    </>
  ),

  // Ribbons let out of an open frame — no craft rule, only the run of it.
  "template-free-form": (
    <>
      <g opacity={0.18}>
        <path d="M-10 40 C70 20 110 74 190 54 C260 36 280 82 330 66" />
        <path d="M-10 168 C70 148 110 196 190 176 C260 158 280 200 330 186" />
      </g>
      <g opacity={0.85}>
        <path d="M148 34 H36 V166 H148" />
        <path d="M64 138 C130 122 110 74 176 60 C226 50 232 84 268 72 C296 62 300 96 330 88" />
      </g>
      <g opacity={0.28}>
        <path d="M64 110 C130 94 110 46 176 32 C226 22 232 56 268 44" />
        <path d="M64 166 C130 150 110 102 176 88 C226 78 232 112 268 100" />
      </g>
    </>
  ),
};

/** True when a manifest key has a scene drawn for it — the caller's honest
 *  test, exactly as `hasEmblem` is for the small mark. A key with no scene
 *  falls back to the banded emblem card, never to a wrong picture. */
export function hasScene(key: string): boolean {
  return key in SCENES;
}

export function DeckSceneArt({ sceneKey, className }: { sceneKey: string; className?: string }) {
  const scene = SCENES[sceneKey];
  if (!scene) return null;
  return (
    <svg
      aria-hidden
      viewBox="0 0 320 200"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {scene}
    </svg>
  );
}
