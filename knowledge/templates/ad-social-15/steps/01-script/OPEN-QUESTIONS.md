# Open questions — ad-social-15 script step

Opened 2026-10-06, when the ads discipline was added. **This template is n=0, written entirely from
doctrine authored in the AI registry**, so almost everything is open. The list below is the subset
that would change what the studio builds. `ad-spot-30` shares a1–a5 and adds its own.

---

### a1 · The `AdAngle` set has no pictorial-analogy angle, and keeps `problem-solution` ⭐
The registry's `angle-template-seeding` gives two frequencies. Pictorial analogy is "the most frequent
template among winners, about two-fifths of the matches", and consequences is "the second most
frequent". Its rule is "Always include the analogy and consequences angles when they fit." The studio's
set is `twist | exaggeration | demo | emotional | absurd | problem-solution`. It has no analogy slot.
It does have a slot for the shape the same document calls "the category default in most markets, and
the most common source of the banal execution".
*Settles it:* a product decision. Either add `analogy` (likely replacing or demoting
`problem-solution`), or keep the set and document `twist` as covering analogy-replacement. The
evidence is peer-reviewed but from 1999 and mostly print. This is a strong default, not a
measurement of video.

### a2 · Does angle seeding actually widen a model's idea set? ⭐
`divergence-before-selection` grades its own claim: "Its effect on model output has not been measured;
its basis is the template research and the persona result."
*Settles it:* generate N sets with and without per-slot angle seeds from one brief, and count
duplicates by mechanism (or embedding similarity). The registry's `unmeasured-is-not-pass` decision
rule applies until then: "report the claim as unmeasured until a duplicate count or similarity
figure stands behind it."

### a3 · Who writes the banality floor, and does it persist per category?
`banality-screen` says to "write the obvious ads first, on purpose", give the floor to a *separate
judging pass*, and keep it with the brief: "rejections are evidence about what this creator finds
generic". The studio has no per-category store for that floor and no judge pass in the pipeline as
designed.
*Settles it:* whether the Idea round becomes generate → judge (two calls), and where a floor lives
between projects.

### a4 · There is no shot-count or end-card-hold measurement
The template's shot band (2–5 + card at 15s) is INFERRED from `timed-shot-list` arithmetic. The end-card
hold has no published figure: "No platform or standard publishes an end-card duration for feed ads."
The only number is "about two seconds" for six-second ads (lore).
*Settles it:* a small corpus, perhaps five to ten well-regarded 15s vertical ads, timed per shot with
the end card measured. That is also what a `params.json` would need first. Until then there is none,
for the reason `teaser` gives: an estimate laundered into the library is worse than a gap.

### a5 · Does filmed-ad brand-timing evidence transfer to a generated four-shot ad?
The peer-reviewed spine (brand pulsing against avoidance; brand in the last third doing worst) was
measured on filmed TV and online ads, with "dozens of commercials and about two thousand viewers".
A 15s ad made from four generated clips has fewer, longer shots than most of that corpus.
*Settles it:* nothing this studio can run alone. It needs a recall or attribution test, and the
studio has none. Record the brand-pulse count per scenario so that a later test has something to
correlate.

### a6 · Is 9:16 the only aspect this template delivers?
`reframe-per-aspect` says one ad usually ships in several frames, and that "the cheapest moment to serve
several aspects is **at the still**". The template is 9:16-only. If a project later wants a 1:1 cut
for a mixed feed, composing the stills for a shared region now is cheap, and adding it later is a
re-shoot.
*Settles it:* whether an ads project can carry more than one delivery aspect. This is the same
product question as `t3` in the teaser template: is one project one deliverable?

### a7 · Which shots should never call the i2v model?
`motion-amount-tradeoff` and `select-on-stills` both recommend the edit-only move (a slow push on the
still, with no model call) for product and logo shots that need no parallax, atmosphere or life in a
figure. The Scenario schema has no field that marks a shot as an editor move rather than a generated clip.
*Settles it:* adding a `motionSource: 'generate' | 'edit'` decision per shot, or documenting that every
shot is generated and accepting the cost on product shots.

---

## Not asked

**Whether a given ad works.** The registry is explicit that structure cannot establish it. Encoding a
proxy here would be the laundering this library exists to prevent.
