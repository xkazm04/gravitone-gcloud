# 02 · Frames — open questions

Opened 2026-08-12 by the `frmwrkd--ai-vox-motion-graphics` run. A craft run that raises fewer
questions than it answers did not look hard enough; this one answered a method and left most of the
measurement open.

---

### Q1 · How big is "big type"?

`PATTERNS.md` §3 says large type survives generation and micro type does not, and gives no threshold.
Without one the rule can steer a composition but cannot validate one.

**Settled by:** a controlled generation trial — the same style block and action at descending type
sizes (as share of frame height), scored for legibility and character corruption. This is cheap to
run against the Leonardo test credits and would produce the library's first MEASURED figure for this
step.

### Q2 · Does a style block survive reuse across *projects*?

`VISUAL-STYLE.md` §4 describes capturing a style from a screenshot and locking it. The source only
ever reuses a block **within one video**. The studio's ambition (a user's own look, onboarded once,
applied to every project) needs it to hold across projects and subjects.

**Settled by:** applying one captured block to two projects with unrelated subject matter and judging
whether the outputs read as one house style — or whether the block silently carries subject
contamination from the reference it was captured off.

### Q3 · What is the Vox element vocabulary, as a closed list?

A sibling run ([[2026-08-12-vox-style-ai-motion-graphics]]) extracted a candidate five: a single
narrator, animated maps and arrows, big punched-on captions, a quick push-in, one tight topic. That
is one source's list and four of the five are visual primitives.

**Settled by:** a teardown of actual Vox output — not a tutorial about it — counting the element
types that appear and their frequency. This library has no source that has read the real thing.

### Q4 · Which parts of the style block does a model actually honour?

The block names colours, typography and elements. Nobody has isolated which of those the model
respects and which it quietly re-invents. If, for example, palette holds and typography does not,
that changes what the studio should draw versus generate.

**Settled by:** an ablation — generate the same action with one component of the block removed at a
time, and compare.

### Q5 · Does the mid-clip style drift ([00:09:38]) reproduce?

The single most consequential rule in the source — that the reference image alone does not hold style
through video generation — rests on one practitioner's report of one failure. It is currently the
justification for carrying a style block into the motion prompt.

**Settled by:** two motion generations off the same approved still, one with the textual style block
and one without, compared frame-to-frame at the clip's tail.

### Q6 · Where is the boundary between a generated plate and a drawn layer?

`PATTERNS.md` §4 routes data-bearing content to code and everything else to a model, but there is no
rule for the middle: a label that is not data, an arrow that points at a real place, a map.

**Settled by:** working the routing rule against a real script's frame list and recording every shot
the rule cannot classify.

---

## Answered elsewhere, recorded so it is not re-asked

- **"How do we animate without an image-to-video model?"** — answered for the first time across four
  same-day research runs by this source: code-driven rendering (Remotion), parallax and camera moves
  over stills, composited layers. Filed as
  [`.vault/Reference/remotion-code-driven-motion.md`](../../../../../.vault/Reference/remotion-code-driven-motion.md).
  The *craft* half — which shots deserve which treatment — is Q6 and remains open.
