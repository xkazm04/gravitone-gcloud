# Open questions — ad-spot-30 script step

Opened 2026-10-06. **n=0, doctrine only.** Questions `a1`–`a7` in
[`ad-social-15/steps/01-script/OPEN-QUESTIONS.md`](../../../ad-social-15/steps/01-script/OPEN-QUESTIONS.md)
apply here unchanged: the missing analogy angle, angle-seeding unmeasured, the banality floor's home,
no timing corpus, filmed-to-generated transfer, single aspect, and editor-move shots. This file adds
only the questions the 30s rung raises.

---

### s1 · Is a 6-shot cap compatible with 30–45s? ⭐
`timed-shot-list` floors each shot and caps it at one clip ("Plan durations that are **at or below**
one clip length"). With six shots, a 30s spot averages ≥4.4s per picture shot after the end card, and
a 45s spot averages ≥7s. That is past the usable span of a 5s clip and near the end of a 10s clip,
where "drift is least" no longer holds.
*Settles it:* either raise the cap for this template, or narrow the range (e.g. 20–35s). The other
option is to accept 10s clips and record usable spans, so that the acceptance data shows whether late
seconds hold. The decision is the pipeline's. The doctrine only says "never compress every shot below
its floor" and never let the cap choose the cut.

### s2 · Should the Idea round flag ideas that need their turn?
`length-rungs`: "When an idea cannot be told in fifteen seconds without its turn, it is a
thirty-second idea." If an ads project can later derive a 15s from its 30s, the creator needs to know
at pick time which ideas cannot be cut down. The Idea schema has no field for it.
*Settles it:* whether a project can own more than one rung of the same ad. This is the same product
question as `a6`, and as `t3` in the teaser template.

### s3 · 16:9 or 1:1 — who chooses, and when?
The template allows either. `reframe-per-aspect` says the choice should be made before any still is
generated: "Generating natively per aspect costs more stills; cropping a still that was never composed
for the crop costs the shot." If the choice is deferred to Finish, every still was composed for the
wrong frame half the time.
*Settles it:* put the aspect on the Brief card (the `platform` field already implies it), and make it
immutable after Round 2.

### s4 · Is a broadcast master in scope?
`single-bed-loudness` separates online masters (~−14 to −16 LUFS, lore) from broadcast ones (−23 LUFS /
−24 LKFS, max short-term −18 LUFS, standard-grade), and says to "keep a separate master per destination
class". A 30s spot is the length most likely to be asked for broadcast. The pipeline as designed
exports one loudness.
*Settles it:* whether any user places a spot on broadcast. If not, document "online only" on the
template and do not build the second master.

---

## Not asked

Whether the 30s spot outperforms the 15s ad. The one test the registry cites is a single brand, and
this studio could not run a better one.
