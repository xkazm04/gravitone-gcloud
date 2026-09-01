# /foundry accessibility & legibility audit — 2026-08-28

Scope: the Foundry page (Cull · Extract · Styles), on the operator's request that "content needs to be
enlarged to be visible". Audited against WCAG 2.2 AA; every finding below is FIXED in the same change.

| # | WCAG | Finding | Fix |
|---|---|---|---|
| 1 | 1.4.4 / legibility | Body copy and chips ran 9–12 px across all three tabs — score chips at 9 px, run metadata at 10 px, keyboard hints at 11 px. | Type scale raised one step everywhere: 9→11, 10→12, 11→12, 12→13 px (headers unchanged). Applied uniformly to FoundryView, CullGrid, Lightbox, parts, ExtractView, ExtractBoard; the new StylesShelf was written at the new scale (12–16 px). |
| 2 | 1.4.3 contrast | `text-white/30`–`/50` on the near-black ground measured ≈2:1–3.5:1 — the save-state line, log tails, hints and metadata all failed AA (4.5:1). | Alpha floor raised: /30·/35→/55, /40·/45→/60, /50→/65. Decorative borders (non-text) untouched. |
| 3 | 2.4.7 focus visible | Covered by the global `:focus-visible` base rule (globals.css) and Button's explicit ring; raw `<button>` tiles inherit the base rule. | Verified; no change needed. |
| 4 | 2.1.1 keyboard | Cull and Extract had diverging keyboard maps: Cull had Enter-to-compare, Extract did not; wording differed (throw vs reject, "Learn" vs "Commit"). | One triage grammar on both tabs: arrows move · K keep · X reject · U clear · Enter inspect. Extract's Enter opens the focused row's best replica (else transfer, else source) with its words. Verdict stamps unified (KEPT / REJECTED), commit buttons named alike ("Commit the cull" / "Commit the kept styles"). |
| 5 | 2.5.8 target size | Extract's K/X row keys were 28 px. | 32 px (`h-8 w-8`); all other targets already ≥24 px. |
| 6 | 4.1.2 name/role | Row verdict keys were icon-letters with `title` only; family filters had no state semantics. | `aria-label` + `aria-pressed` on row keys; `aria-pressed` on family filter buttons; `aria-label` on the family nav; card buttons carry "Open <name>". |
| 7 | 1.1.1 alt text | Present throughout; hero and modal images name the style and the image's role ("<name> — kept render / transfer / source"). | Kept; new components follow it. |
| 8 | 1.4.10 reflow | Cull matrix scrolls inside its own `overflow-x-auto`; Styles cards reflow 1→2→3 columns; family rail wraps horizontally under `lg`. | Verified with the larger type; Cull columns widened (170 px label, 200 px tiles) so the bumped text does not clip. |

Also in this change (operator-requested redesign, not WCAG): Styles tab shows ONE image per card with
the rest in a modal; cards load twelve at a time behind an IntersectionObserver sentinel; a family rail
(derived via `deriveFamily` when the stored family is `unsorted`) sits left of the grid in a breakout
container (`min(100vw−3rem, 1500px)`) so filtering never narrows the cards.

Not addressed (pre-existing, page-wide): the aurora backdrop's contrast with `LOCAL`/`auth off` header
chrome (StudioFrame, out of foundry scope); prefers-reduced-motion is handled globally in globals.css.
