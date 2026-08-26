# Bundle v1 · style-04 · photoreal film still — 25 cinematic situations × 2 recipes

World: **"HALO OF SALT"** (see `.vault/Research/atlas/atlas-cinematic-v1.md` § The constant world). Source rows: the atlas's C-ids. Score sheet: `../score-sheet-style-04.csv` (100 rows = 50 prompts × 2 model arms).

## LOOK BLOCK (fixed for the whole file; restated verbatim at the start of every prompt)

> A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated.

No lighting in the block — lighting is the per-situation variable and is named in every prompt by source · direction · quality · colour. Aspect is never in the prose (it is the 16:9 parameter). No negatives; absence is stated positively. Both model arms share one prompt text (both are prose models).

## Model arms (settings frozen for the whole file — see `../README.md`)

| Arm | Model | Mode | Preset | Prompt Enhance | Contrast | Aspect | Images | Negative | Seed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| primary | **Lucid Realism** | Fast | None | OFF | n/a | 16:9 | 4 | none (no field) | random |
| secondary | **Lucid Origin** | Fast | None (default is Dynamic — change it) | OFF | Medium | 16:9 | 4 | none (no field) | random |

Never "Auto"; never "Improve Prompt"; paste the text exactly. Record the model name as shown that day.

## Score (1–10, against the block's Goal + Implied motion, best of 4)

| Score | Meaning |
| --- | --- |
| 1–2 | wrong: not the situation, or unusable (text leak, broken anatomy, wrong subject count) |
| 3–4 | recognisable but fails the goal (scale not felt, dread not there, mechanism unreadable) |
| 5–6 | achieves the goal weakly; would need an edit or a re-roll |
| 7–8 | achieves the goal; I'd start the scene from this frame after small fixes |
| 9–10 | I'd ship it as the scene's first frame as-is, and I can see the move working |

**Fail tags** (one per row, fixed list): `text` · `anatomy` · `count` · `style-drift` · `composition` · `lighting` · `no-motion-affordance` · `other`. Plus `best_of_4` (1–4) and an optional one-word `note`.

Rules the prompts obey: 70–120 words; observable facts, no praise words; lighting by source/direction/quality/colour (+ a named setup only where it helps); focal numbers only with effect words; ≤2 subjects; faces late/fragmented unless identity is the point; no brand or film-stock names; R1 and R2 differ in recipe (size / angle / lens / placement / lighting), never in style. The motion line is identical for R1 and R2 of a situation: the still is the variable.

---

## A. World, place

### C01-R1 · Establish the world — R1 extreme wide, overcast, tiny figure
Goal: where we are and what kind of place, before any person matters  |  Implied motion: slow aerial glide forward (reliable, slow forward only)  |  Risk: safe
Recipe: extreme wide · slightly above eye level · wide feel, deep focus · horizon lower third, tower on the right third, figure ≤5 % · flat overcast, no cast shadows, sky brightest · near-mono bone/slate, saturation falling with distance
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. An extreme wide shot from slightly above eye level, deep focus. A dead white salt bed cracked into flat plates runs to a horizon on the lower third; a colossal derelict desalination tower stands on the right third, its top lost in pale haze; one surveyor in a dust-grey thermal suit is a speck at its foot. Flat overcast daylight, no cast shadows, the sky the brightest field. Three tonal bands: sky, haze, salt. Nothing else in the frame.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Slow aerial glide forward over the salt toward the tower; thin dust drifts low across the ground; the tower and sky stay still."
What the move needs from this still: a scrollable ground texture, a horizon that stays level, the tower far enough that the glide has somewhere to go, no figure large enough to morph.

### C01-R2 · Establish the world — R2 long-lens stacked planes
Goal: same  |  Implied motion: same (reliable)  |  Risk: safe
Recipe: extreme wide from far away · eye level · long-lens compression, layers · crawler midground, tower behind, haze between planes · flat overcast · paper-layer mono
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. An extreme wide shot from far away with long-lens compression: the salt plates flattened into stacked bands, a low tracked crawler vehicle as a small dark shape in the midground, the derelict tower rising behind it as a flat grey cut-out, haze between each plane so every layer is paler than the one before. Flat overcast light, no shadows. The frame reads as layered paper: near salt, crawler, far tower, sky. No figures.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Slow aerial glide forward over the salt toward the tower; thin dust drifts low across the ground; the tower and sky stay still."
What the move needs from this still: clean silhouettes between the layers (no thin occluders) so the drift parallaxes; the crawler small enough not to need invented sides.

### C02-R1 · Reveal scale — R1 low angle, backlit mass, figure at the foot
Goal: awe — the size is felt by comparison  |  Implied motion: tilt up from base to top (conditional; reliable with the tower's vertical)  |  Risk: safe
Recipe: extreme wide · low angle up · wide feel · tower edge to edge exiting the top, figure lower third · contre-jour: sky brighter behind the tower, thin bright edge, long soft shadow toward camera · bone/slate, one faint warm horizon tone
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. An extreme wide shot from a low angle looking up: the derelict desalination tower fills the frame edge to edge and exits the top, a dark salt-crusted mass with a thin bright edge against an overcast sky brighter behind it. At its foot, on the lower third, one surveyor in a dust-grey thermal suit stands small, back to camera, casting a long soft shadow toward the lens. Salt plates in the foreground, plainly lit. One faint warm tone at the horizon only.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Slow tilt up from the surveyor's feet to the tower's top; she stays still; haze drifts slowly."
What the move needs from this still: a strong vertical that continues past the top edge; the figure static; the bottom of the tower readable so the tilt has a start.

### C02-R2 · Reveal scale — R2 humans first, then the giant (limb edge in the foreground)
Goal: same  |  Implied motion: same (conditional)  |  Risk: safe (limb edge only)
Recipe: wide · low angle, knee height · normal · figure mid-frame looking screen-right, limb entering from the right edge · flat overcast, the arm slightly darker · bone/slate + one blue-green seam
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A wide shot, low angle, camera at knee height. The surveyor in a dust-grey thermal suit stands mid-frame on white salt, looking screen-right; from the right edge a single segmented pipe-arm of dark metal, thicker than her whole body, enters the foreground and rests on the salt, salt crust on its joints. Flat overcast light, the arm slightly darker than everything else, a faint pale blue-green glow in one seam. Sky plain grey.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Slow tilt up from the surveyor's feet to the tower's top; she stays still; haze drifts slowly."
What the move needs from this still: the arm's edge large and plain (no fine texture to crawl); the figure's eyeline stated; enough sky above for the tilt.

## B. Characters

### C10-R1 · Hero intro, detail first — R1 gloved hand on the case latch (macro)
Goal: trait before face — craft, the object she carries  |  Implied motion: slow push-in on the detail (reliable)  |  Risk: conditional (hands: gloved, flat, cropped at the wrist)
Recipe: extreme close-up · straight-on, slightly top-down · macro feel, shallow · detail on a third, clean ground · raking overcast side light for texture · bone/slate + the case's one dull colour
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. An extreme close-up, slightly from above, shallow depth of field: a gloved hand in dust-grey suit fabric rests flat on the steel latch of a scuffed sample case, fingers together, the wrist cropped by the frame edge. Raking overcast side light from the left shows the glove's woven texture and salt crust on the latch; the salt ground behind is a soft pale blur. Nothing else is sharp. The case's dull olive paint is the only colour.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Slow push-in toward the subject; a thin thread of salt dust drifts across the ground; the subject holds the pose."
What the move needs from this still: the latch sharp now (the push ends on it); breathing room around the hand; the glove seen as one flat shape, no finger articulation to invent.

### C10-R2 · Hero intro, detail first — R2 single full-shot entrance
Goal: same, in one frame  |  Implied motion: same (reliable)  |  Risk: safe
Recipe: full shot · slightly below eye level · normal · figure centred with a rim of sky behind the head · even shadowless daylight · suit the darkest shape, plain background
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A full shot, camera slightly below eye level: the surveyor in a dust-grey thermal suit stands on cracked white salt at the foot of a derelict tower's salt-crusted strut, hood up, visor down, sample case in one hand at her side, feet planted. A rim of overcast sky behind her head and shoulders separates her from the slate-grey steel. Even, shadowless daylight; the suit the darkest shape in the frame; background kept plain.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Slow push-in toward the subject; a thin thread of salt dust drifts across the ground; the subject holds the pose."
What the move needs from this still: full body inside the frame, static stance, a plain background behind the head so the push does not crawl.

### C11-R1 · Hero intro, silhouette — R1 dark figure in a bright round opening
Goal: identity as outline; the later face earns its weight  |  Implied motion: slow push-in (reliable); hood fabric stirs (reliable)  |  Risk: safe
Recipe: wide · eye level · normal · figure centred in the intake ring's circle · contre-jour: the opening the brightest field, edges burning out · bone-white halo, slate ring, figure near black
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A wide shot, eye level: a figure stands dark and centred inside the round mouth of a derelict tower's intake pipe, the circle of overcast sky behind it the brightest thing in the frame, the figure's edges burning out into that light, no face detail, only the outline of a soft hood and a pack. The steel ring around the opening is in shade, salt crust on its rim. Bone-white light, slate steel, the figure near black.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Slow push-in toward the figure; the hood's edge stirs in a light wind; the light behind stays constant."
What the move needs from this still: a readable outline with no face to drift; the halo constant in brightness; the figure static or one step.

### C11-R2 · Hero intro, silhouette — R2 hooded medium close-up, face withheld, lamp from below
Goal: same; costume silhouette as identity  |  Implied motion: same (reliable)  |  Risk: safe
Recipe: medium close-up · low angle · normal · hood centred, gaze down · practical wrist lamp from below-front, cool · grey sky, hood silhouette clean
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A medium close-up from a low angle: the surveyor's hood up, face in shadow beneath it, gaze down, only the line of a jaw and the lower edge of a raised visor catching light. A small wrist lamp held just below frame lights the hood's inner fabric and the jaw from below-front with a cool pale glow; behind, a plain grey sky. The hood's silhouette is clean against the sky. No other light source.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Slow push-in toward the figure; the hood's edge stirs in a light wind; the light behind stays constant."
What the move needs from this still: the face hidden so nothing must be invented; the lamp's direction constant; loose hood fabric as the one moving thing.

### C12-R1 · Hero wakes — R1 overhead, body on the salt, face hidden
Goal: intimacy before identity; the body and the ground  |  Implied motion: overhead camera lowers toward the body (reliable — a push-in from above)  |  Risk: safe
Recipe: high angle, directly overhead · wide-normal · body in the middle third, face hidden by the hood · flat overcast top light · bone/slate, suit darkest
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A high-angle shot, camera directly overhead: the surveyor lies on her side on a plain white salt bed cracked into plates, the dust-grey suit the darkest shape, the hood pulled over so the face is hidden, one arm outstretched with the gloved hand palm down on the salt. She fills the middle third of the frame with salt plates all around. Flat overcast top light, no shadows. Nothing else on the ground.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Overhead camera slowly lowers toward the body; the fingers close slightly; everything else still."
What the move needs from this still: a true 90° top-down with the target centred and margins; flat light without speculars; the hand already flat so the closing is small.

### C12-R2 · Hero wakes — R2 macro of a bare hand on salt crust
Goal: same; the cut comes in on skin  |  Implied motion: same (reliable)  |  Risk: conditional (bare hand — back of the hand only, no working fingers)
Recipe: extreme close-up · ground level · macro · hand palm down, wrist exiting left · flat overcast, soft · fine texture on hand and crust only
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. An extreme close-up, camera low at ground level: the back of a bare hand resting palm down on salt crust, the skin dry and pale, fine white grains caught in the knuckle creases, the wrist and a dust-grey suit cuff exiting the frame at the left edge. Beyond the hand the salt plain blurs to a pale band under a grey sky. Flat overcast light, soft; fine texture only on the hand and the crust.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Overhead camera slowly lowers toward the body; the fingers close slightly; everything else still."
What the move needs from this still: five fingers present and resting (count them); the wrist at the edge; the far plane a plain band so only the hand carries detail.

### C13-R1 · Armour-up — R1 visor sliding down (insert)
Goal: ritual and readiness; parts before the whole  |  Implied motion: the visor completes its last short movement; camera still (conditional)  |  Risk: conditional (no hands shown — safe as staged)
Recipe: extreme close-up · straight-on · macro · visor shell filling the left two-thirds · one hard light from the right, the rest near black (low-key, 8:1) · slate, salt white, one cool status seam
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. An extreme close-up, straight on: a helmet visor slides down across the frame, its curved pale-grey shell filling the left two-thirds, a thin pale blue-green status seam glowing along its edge; on the right, in shadow, the soft hood's collar seal. One hard light from the right side rakes the visor's surface and leaves everything else in near black. No hands visible. Slate grey, salt white, the single cool seam.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Camera holds still; the visor completes its last short movement into place; nothing else moves."
What the move needs from this still: the visor caught a finger's width from closed (the consequence of motion, not blur); one light direction; dark surround.

### C13-R2 · Armour-up — R2 from behind as the hood goes up, the tower ahead
Goal: same, with departure in the beat  |  Implied motion: same (conditional)  |  Risk: safe (back, gloved hands hidden by fabric)
Recipe: medium shot from behind · eye level · normal · figure at the open hatch, tower through it · the hatch opening the brightest field lighting her shoulders from the front · bone beyond, slate inside
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A medium shot from behind: the surveyor stands at the open hatch of the crawler's cab, dust-grey suit, hood going up over the helmet, both gloved hands raised to the hood's edge with the fingers hidden by the fabric; ahead, through the hatch, the derelict tower stands on white salt in haze. The cab interior is dim; the hatch opening is the brightest field and lights her shoulders from the front. Bone white beyond, slate inside.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Camera holds still; the hood completes its last short movement into place; nothing else moves."
What the move needs from this still: the hood caught an inch from settled; hands hidden; the back only, the destination visible.

### C14-R1 · Tool reveal — R1 the survey lance across the frame, no hand
Goal: genre and craft in one object  |  Implied motion: camera still; the tip's glow brightens and flickers once (reliable)  |  Risk: safe
Recipe: close-up · eye level · long-lens feel, shallow · rod horizontal across the frame, ends exiting · strong rim from behind-above; the rest soft · bone/slate + the tip's one blue-green
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A close-up, eye level, shallow depth of field: a survey lance — a long dull-steel rod with a blunt sensing tip — held horizontal across the whole frame, both ends exiting the sides, no hand in view, against a plain grey salt-haze sky. A strong rim from behind and above traces the rod's upper edge in thin white; the tip alone holds a faint pale blue-green glow. The rest of the frame is soft, empty haze.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Camera holds still; the tip's glow brightens slowly and flickers once; nothing else moves."
What the move needs from this still: the glow already present with fall-off on the rod; plain background; no hand to morph.

### C14-R2 · Tool reveal — R2 the tool as the light on the face
Goal: face and power in one frame  |  Implied motion: same (reliable)  |  Risk: conditional (face + prop; hand below frame)
Recipe: medium close-up · eye level · normal · three-quarter face, tip below the lower edge · under-light from the tip, cool, the only source · grey haze behind
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A medium close-up, eye level: the surveyor, hood back, visor raised, holds the lance's tip just below the frame's lower edge; its cool pale blue-green glow lights her jaw and cheeks from below and to the side, her eyes near the lens, evenly readable. Behind her the grey salt plain falls to soft haze. No other light source; the glow is the brightest thing in the frame. Three-quarter view, neutral expression, hair tucked in the hood.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Camera holds still; the tip's glow brightens slowly and flickers once; nothing else moves."
What the move needs from this still: the face evenly lit enough to survive a brightness change; the hand out of frame; the glow's fall-off already on the skin.

### C15-R1 · Antagonist intro (the keeper) — R1 full shot, low angle, lit by its own chest lamp
Goal: menace and dominance; withhold  |  Implied motion: very slow push-in (reliable); lamp flickers (reliable)  |  Risk: safe (face withheld)
Recipe: full shot · low angle, slight cant · slight wide from below · figure filling the frame top to bottom, foreground object large · under-light / self-lit practical, eyes black, the rest black · slate-black, salt-white shell, one cold lamp
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A full shot from a low angle, the horizon tilted slightly: a tall figure in an old salt-crusted white hard-shell suit fills the frame from bottom edge to top edge, lit only by a single lamp on its own chest, so the chest plate glows and the helmet's face plate stays black. The salt ground at its feet catches the lamp's fall-off; behind, night-black. In the near foreground, large and soft, the head of a survey lance crosses the lower corner.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Very slow push-in toward the figure; the chest lamp flickers once; the figure does not move."
What the move needs from this still: one source with visible fall-off; the face plate black by description; the foreground object soft so the push parallaxes.

### C15-R2 · Antagonist intro — R2 kept out of focus beyond the hero's shoulder
Goal: same; frustrate the need for clarity  |  Implied motion: same (reliable)  |  Risk: safe
Recipe: medium shot · eye level · shallow · sharp shoulder right third, soft far figure · flat overcast, no shadows · bone/slate, one far point of light
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A medium shot at eye level, shallow depth of field: in the sharp foreground on the right third, the surveyor's dust-grey shoulder and hood edge seen from behind; beyond her, across open salt under a grey sky, a tall pale figure stands far off, soft and unresolved, a single point of light on its chest the only sharp-seeming thing about it. The salt between them is empty. Flat overcast light, no shadows. The far figure stays out of focus.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Very slow push-in toward the figure; the chest lamp flickers once; the figure does not move."
What the move needs from this still: two planes (sharp shoulder, soft figure) so the push reads; the far figure recognisable but soft — not mush.

### C17-R1 · Intimacy — R1 medium close-up, single cab lamp, three-quarter face
Goal: closeness; the rest of the world excluded  |  Implied motion: very slow push-in (reliable); slight head turn toward lens (reliable)  |  Risk: safe (one face, ¾, evenly readable)
Recipe: medium close-up → close-up · eye level near her sight-line · short-tele feel, shallow · eyes on the upper third, low headroom · single practical lamp, warm, fast fall-off, no other light · monochrome warm skin against brown-black
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A medium close-up at eye level, camera close to her sight-line, shallow depth of field: the surveyor sits inside the crawler's cab, hood back, three-quarter view, eyes on the upper third looking just past the lens. A single small cab lamp to her left is the only light, warm, falling off fast so the far side of her face and the cab behind go to brown-black. Skin amber, suit dust-grey. Nothing sharp behind her.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Very slow push-in; she turns her head slightly toward the lens; the lamp stays steady."
What the move needs from this still: a ¾ start so the turn reveals little new face; the lit side readable; no hands in frame; breathing room for the push.

### C17-R2 · Intimacy — R2 over-the-shoulder, listener's shoulder soft
Goal: same; two people share the frame  |  Implied motion: same (reliable)  |  Risk: conditional (two figures — one face + one soft shoulder)
Recipe: OTS medium close-up · eye level · short-tele, shallow · speaker ¾ sharp, shoulder soft left · one warm lamp from the right, shadow side two stops down · warm skin, grey suits, rear wall black
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. An over-the-shoulder medium close-up inside the crawler's cab: a second surveyor's dust-grey shoulder and hood soft in the left foreground; past it, sharp, the surveyor's face in three-quarter view, hood back, lit by one warm cab lamp from the right, the shadow side readable but two stops darker. The cab's rear wall falls to near black. Warm skin, grey suits, no other light. Both heads on the upper third.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Very slow push-in; she turns her head slightly toward the lens; the lamp stays steady."
What the move needs from this still: the foreground shoulder soft and faceless; the subject ¾; one light direction; no eyelines to match.

### C18-R1 · Isolation — R1 extreme wide, blue hour, one warm point far away
Goal: emptiness around one person  |  Implied motion: slow pull-out (conditional single; reliable with a last frame)  |  Risk: safe
Recipe: extreme wide · slightly above eye level · wide · figure small near the bottom edge, left third; closed frame on the right · blue hour: even blue, no shadows, one warm window · cool desaturated + one warm speck
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. An extreme wide shot, slightly above eye level: just after sunset, the whole salt plain washed in even blue, no shadows. The surveyor is a small dust-grey figure near the bottom edge on the left third; the tower's salt-crusted wall cuts the frame as a hard dark edge on the right. Far away across the salt, one warm yellow point: the lit cab of the crawler. Most of the frame is empty blue salt and deeper blue sky.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Slow pull-out, the figure shrinking; the warm point stays constant; nothing else moves."
What the move needs from this still: world cues at all four edges (salt, wall, sky) so the pull-out has context to extend; the figure tiny and static.

### C18-R2 · Isolation — R2 extreme close-up of the visor reflecting empty salt
Goal: same, when the scene cannot widen  |  Implied motion: same (conditional)  |  Risk: safe
Recipe: extreme close-up · straight-on · macro feel · visor filling the frame, reflection soft · flat overcast, no hard shadow · bone/slate/dust grey
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. An extreme close-up, straight on: the surveyor's visor fills the frame, its curved pale-grey glass reflecting only empty white salt and a flat grey sky, a tiny dark crawler in the reflection near the lower edge. The hood's fabric frames the visor at the top and sides. Flat overcast light, no hard shadow, the reflection soft. No face visible behind the glass. Bone white, slate, dust grey.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Slow pull-out, the visor shrinking to show the hood and shoulders; the reflection stays constant; nothing else moves."
What the move needs from this still: the hood edges present at the frame borders (the pull-out reveals them); no face behind the glass to invent.

### C19-R1 · Grief — R1 medium close-up from slightly above, profile, flat grey light
Goal: weight and stillness; numbness, not drama  |  Implied motion: static long hold (reliable); shoulders lower on a breath (reliable)  |  Risk: safe (profile)
Recipe: medium close-up · slightly high · normal / short-tele, shallow · head low, generous headroom, profile turned away · flat shadowless overcast (north-window feel) · drained grey and grey-blue, one remnant colour
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A medium close-up from slightly above: the surveyor in profile, turned away from camera toward the left, hood back, head low in the frame with generous headroom above, eyes down. Flat overcast light like a north window, shadowless, grey; the salt plain behind her a soft pale field. Drained grey and grey-blue throughout; the only colour a dull olive sample case held against her chest. Shallow depth of field. No hard shadow anywhere.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Camera holds still, long hold; her shoulders lower slightly on a breath; nothing else moves."
What the move needs from this still: a profile (nothing new to reveal), shadowless light that cannot slide, a plain background.

### C19-R2 · Grief — R2 face withheld: back of the hood, hands holding a cracked visor
Goal: same; the face would be the least stable thing  |  Implied motion: same (reliable)  |  Risk: conditional (hands — flat, fingers together)
Recipe: medium close-up from behind, slightly above · normal · hood left half, visor held flat at chest height · flat overcast, no shadows · grey on grey, the crack sharpest
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A medium close-up from behind and slightly above: the back of the surveyor's hood fills the left half, head bowed; in her gloved hands, held flat in front of her at chest height, a second helmet's cracked visor, the glass starred and milky. Flat overcast light, no shadows, the salt plain a pale blur beyond. Fingers together, hands seen as two flat shapes. Grey on grey; the visor's crack the sharpest thing.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Camera holds still, long hold; her shoulders lower slightly on a breath; nothing else moves."
What the move needs from this still: the hands as two flat shapes (no articulation); the back of the hood; nothing behind that must stay sharp.

### C20-R1 · Decision moment — R1 held medium close-up for the slow push
Goal: interior turn; quiet climax  |  Implied motion: barely perceptible dolly-in from a held static (reliable)  |  Risk: safe
Recipe: medium close-up · eye level · normal / short-tele, shallow · ¾ face, eyes sharp, breathing room · soft side light from the cab window, shadow side two stops down (4:1) · near-mono, trace warmth on the lit cheek
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A medium close-up at eye level, shallow depth of field: the surveyor in three-quarter view inside the crawler's cab, hood back, visor up, eyes sharp and steady on a point just off the lens, expression neutral, mouth closed. Soft side light from the cab window on the left; the shadow side two stops darker but readable. Breathing room around the head and shoulders, the cab behind a soft grey. No warm light; near-monochrome with a trace of warmth on the lit cheek.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Slow, barely perceptible push-in from the held frame; her eyes stay fixed; nothing else changes."
What the move needs from this still: 20–35 % breathing room so the push has somewhere to go; the destination (the eyes) sharp now; neutral expression with slight asymmetry; nothing else that could move.

### C20-R2 · Decision moment — R2 decide in a wide, walking away toward the hatch
Goal: same; the body carries it before the face is earned  |  Implied motion: same (reliable) — here a push on the receding figure  |  Risk: safe (walk-away is the reliable gait)
Recipe: wide · eye level · normal · figure small mid-frame from behind, hatch on the upper third, tower on the right edge · flat overcast · bone/slate + one blue-green seam
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A wide shot, eye level: the surveyor seen from behind, small, mid-frame, walking away across cracked white salt toward the circular dark hatch of the buried machine, back heel lifted, weight forward, a thin skirt of salt dust low behind the trailing boot. The hatch sits on the upper third, a faint pale blue-green seam visible in it; the tower's base on the right edge. Flat overcast light. Most of the frame is empty salt.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Slow, barely perceptible push-in from the held frame; she keeps walking away at a steady pace; nothing else changes."
What the move needs from this still: the back only; the destination visible ahead; mid-stride consequence (heel, dust) without blur; ground texture for the walk.

### C24-R1 · Squad walk — R1 two backs, hip height, toward the tower
Goal: the team as one shape; purpose  |  Implied motion: follow-behind at walking pace (reliable)  |  Risk: safe (backs; ≤2 figures)
Recipe: wide from behind · low, hip height · normal · two backs, destination ahead brighter · overcast, no shadows · bone/slate
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A wide shot from behind, camera at hip height: two surveyors in dust-grey thermal suits walk away side by side, one hood up and one hood down, a pace apart, toward the derelict tower's salt-crusted base ahead; the ground between them and the tower is cracked white salt, the tower's foot faintly brighter than the foreground. Overcast light, no shadows. Their backs fill the lower half; the tower the upper half.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Camera follows at walking pace; the two figures walk steadily; dust drifts low; the destination grows slowly."
What the move needs from this still: backs only (no unseen sides); mid-stride stances; a destination; ground texture; two distinct silhouettes.

### C24-R2 · Squad walk — R2 toward camera, low angle, backlit through dust, legs cropped
Goal: same; lands before a title  |  Implied motion: same (conditional — walking toward camera ≤3 s)  |  Risk: conditional (two walking figures)
Recipe: medium shot · low angle, knee height · normal · two abreast, legs cropped mid-thigh, gazes off-lens · low sun behind rimming hoods, dust curtain lit · grey sky, bone dust
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A medium shot, low angle, camera at knee height: two surveyors in dust-grey suits walk toward camera side by side, legs cropped at mid-thigh, one hood up and one down, gazes just off the lens, a low sun behind them rimming hoods and shoulders in white and lighting a thin drifting curtain of salt dust between them and the camera. Faces in soft shadow, unreadable. Grey sky, bone-white dust, no other light.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Camera holds still; the two figures walk toward it steadily for two seconds; dust drifts low between them and the lens."
What the move needs from this still: faces unreadable (nothing to drift); legs cropped (no feet to slide); dust as a reliable motion cue; the rim constant.

## C. Tension, threat, action

### C25-R1 · Dread before an unseen threat — R1 open frame, wrist lamp the only light
Goal: anticipation; the off-screen space is the threat  |  Implied motion: very slow push-in (reliable)  |  Risk: safe
Recipe: medium shot · eye level · normal, deep focus · figure left third, black opening right two-thirds, look room toward it · low-key single motivated source, no rim, no haze, no flare · desaturated cool, one dim warm point far off
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A medium shot at eye level, deep focus: the surveyor stands on the left third, hood up, looking right; on the right two-thirds, behind her, the black square mouth of an intake tunnel in the tower's base, entirely dark inside. Her wrist lamp is the only light: a small cool pool on her suit and the salt at her feet, falling off to nothing. No rim light, no haze, no flare. Far off in the black, one dim warm point.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Very slow push-in toward her and the dark opening; the lamp's pool stays steady; nothing emerges."
What the move needs from this still: the "empty" space actually empty (check it); one body; one source with fall-off; nothing in the black that could be mistaken for a shape.

### C25-R2 · Dread before an unseen threat — R2 extreme close-up of the hatch seam, a single drop
Goal: same; no body in frame yet  |  Implied motion: same (reliable)  |  Risk: safe
Recipe: extreme close-up · straight-on, shallow · the seam as a line across the frame, drop on it · one hard small light from the left, black beyond · slate, salt white, one dull reflection
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. An extreme close-up, straight on, shallow depth of field: a single drop of dark water sits on the salt-crusted seam of a circular dark-metal hatch, the seam a thin line across the frame; the crust around it dry and white, the seam itself faintly wet. One hard small light from the left rakes the crust; everything beyond the seam falls to black. No hands, no figure. Slate, salt white, and the water drop's one dull reflection.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Very slow push-in toward the seam; the drop trembles but does not fall; nothing emerges."
What the move needs from this still: the seam sharp now (the push ends on it); the drop fully formed; black beyond so nothing must be invented.

### C26-R1 · Threat revealed, partial — R1 two lights deep in a black vent, shoulder rim-lit
Goal: shock without showing the whole  |  Implied motion: slow push on the lights (reliable)  |  Risk: safe
Recipe: close-up · eye level · normal · lights left third inside the vent, shoulder right foreground · blackness + one lit element, thin rim from behind · slate-black + the blue-green points
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A close-up at eye level: on the left third, two small pale blue-green points of light sit deep inside a black rectangular vent in salt-crusted steel, one slightly higher than the other, nothing else inside the vent resolvable; on the right, in the near foreground, the surveyor's dust-grey shoulder and hood edge, rim-lit in thin white from behind. The rest of the frame is near black. The two lights are the brightest things in the frame.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Slow push-in toward the threat; the camera holds level; nothing else in the frame moves."
What the move needs from this still: the two points already sharp; the vent's rim readable so the push has geometry; the shoulder soft and faceless.

### C26-R2 · Threat revealed, mass — R2 silhouettes out of backlit salt dust
Goal: numbers, not detail, are the threat  |  Implied motion: same — the mass advances slowly while the camera holds (conditional: crowd idle as texture)  |  Risk: conditional (silhouettes only; no readable faces)
Recipe: wide · eye level · normal · figures entering from the left, nearest still far · backlight through dust rimming shoulders, fronts unreadable · flat white ground, grey sky
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A wide shot, eye level: out of a backlit curtain of salt dust, six tall salt-crusted white figures walk toward camera from the left side of the frame, seen only as pale silhouettes with dark faceplates, spaced unevenly, the nearest still far; a low light behind them through the dust rims their shoulders and leaves their fronts unreadable. Flat white ground, grey sky. No figure in the foreground. Faces cannot be read.
Motion line (for optional I2V, same for R1 and R2 of this situation): "The figures advance slowly through the dust; the camera holds level; nothing else in the frame moves."
What the move needs from this still: the figures far enough to be texture; dust as the reliable moving element; no faces; the direction of travel stated.

### C27-R1 · Standoff / duel — R1 wide tableau, a third apart, the hatch between
Goal: tension between equals; the gap is the subject  |  Implied motion: static hold (reliable); dust drifts  |  Risk: conditional (two full figures, no contact)
Recipe: wide, both full-body · eye level · natural perspective · surveyor left / keeper right, hatch between · one hard low sun from the left, long shadows, thin dust · cool steel and salt, one hot lamp
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A wide shot at eye level: two full figures on white salt, a third of the frame apart — left, the surveyor in a dust-grey thermal suit, lance held low; right, the keeper in a salt-crusted white hard-shell suit, one chest lamp lit; between them, behind, the circular dark hatch of the buried machine. One hard low sun from the left rakes both and throws long shadows right through thin dust. Cool steel and salt; the lamp the one hot point.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Camera holds still; dust drifts slowly between them; neither figure moves."
What the move needs from this still: both figures full-body and static; no contact; weapons low and apart; heights consistent; dust present as the one moving thing.

### C27-R2 · Standoff / duel — R2 compressed medium two-shot, profiles
Goal: same; pressure, not geography  |  Implied motion: same (reliable)  |  Risk: conditional (two figures in profile)
Recipe: medium two-shot · eye level · long-lens compression · profiles on opposite thirds, narrow gap, background a pale band · hard low sun from the left, long shadows, thin dust · slate, salt white, one lamp
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A medium two-shot with long-lens compression, eye level: the surveyor in profile on the left third facing right, hood up; the keeper in profile on the right third facing left, faceplate dark, chest lamp lit; the gap between them narrow, the salt plain behind flattened to a pale band. Hard low sun from the left, long shadows, thin dust in the air. Both on the same height line, no contact, tools held low. Slate, salt white, one lamp.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Camera holds still; dust drifts slowly between them; neither figure moves."
What the move needs from this still: profiles (nothing frontal to drift); a plain compressed background; the gap readable; no eyelines to match beyond "facing each other".

### C28-R1 · Pursuit — R1 mid-stride toward the lens, limb rising far behind
Goal: speed and stakes  |  Implied motion: she runs toward camera for two seconds, camera still (morph-prone past ~3 s)  |  Risk: conditional (fast motion; one figure + a limb)
Recipe: medium-wide · low angle · wide feel, depth-axis approach · cracks as leading lines toward the lens, pursuer's limb far behind · hard low sun from behind her lighting the dust; front in soft shadow · bone/slate, dust gold
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A medium-wide shot from a low angle: the surveyor caught mid-stride running toward camera across white salt, back heel lifted, weight on the front foot, torso leaning forward, a low skirt of salt dust behind the trailing boot; cracks in the salt run as lines toward the lens; far behind her, near the tower's base, a single dark pipe-arm rises from the salt. Hard low sun from behind her lights the dust; her front is in soft shadow. Subject pin-sharp, no blur.
Motion line (for optional I2V, same for R1 and R2 of this situation): "She runs for two seconds; the camera holds still; dust kicks up behind her; the arm behind does not move."
What the move needs from this still: a mid-stride pose the model can continue (heel, lean, dust); no baked blur; the face shadowed (not the subject); full body in frame.

### C28-R2 · Pursuit — R2 lateral, long-lens, pursuer stacked close behind
Goal: same; the pursuer must feel close  |  Implied motion: same, running left to right (morph-prone; keep ≤3 s)  |  Risk: conditional
Recipe: medium, profile · eye level · long-lens compression · lead room right, limb stacked behind as a soft shape · hard side light from the right lighting the dust · plain pale band behind
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A medium shot in profile with long-lens compression: the surveyor mid-stride running from left to right across white salt, heel lifted, arms driving, a skirt of dust behind her; stacked close behind by the compression, a segmented dark pipe-arm bending toward her as a large soft shape. The salt plain behind is a plain pale band, the sky grey. Hard side light from the right, lighting the dust. Open space ahead of her on the right. No blur.
Motion line (for optional I2V, same for R1 and R2 of this situation): "She runs left to right for two seconds; the camera holds still; dust kicks up behind her; the arm behind does not move."
What the move needs from this still: lead room on the right; a continuable plain background; the limb soft; a running pose without blur.

### C29-R1 · Impact frame (the source) — R1 lance tip in profile, mid-ignition
Goal: impact is an edit; the still is the source  |  Implied motion: the flash blooms, sparks fly screen-right for one second; camera holds (reliable)  |  Risk: safe (profile, no hands)
Recipe: close-up · profile · normal · tip in the left half pointing screen-right, nothing on the right · the flash as the only light, hard, white-cored · slate-black + accent + white core
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A close-up in profile: the head of a survey lance in the left half of the frame, pointed screen-right, its tip mid-ignition — a hard white-cored pale blue-green flash at the tip, frozen sparks radiating from it, the steel rod dark beyond the flash. The flash is the only light, hard, lighting the rod's upper edge and a drift of salt dust; everything else black. Nothing on the right side of the frame to receive it.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Camera holds; the flash blooms and sparks fly screen-right for one second; then the frame darkens."
What the move needs from this still: direction stated and empty space on that side; sparks already radiating from one point; no recipient to invent.

### C29-R2 · Impact frame (the source) — R2 the surveyor braced, hands hidden by the guard
Goal: same; the body's effort reads  |  Implied motion: same (reliable)  |  Risk: conditional (gripping hands — fingers hidden)
Recipe: medium · slight low angle · normal · figure sideways, weight back, lance pointing screen-right · the tip's glow as the key on her suit front; black behind · slate, salt dust, accent
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A medium shot, slight low angle: the surveyor braced sideways to camera, weight back on the rear foot, both gloved hands on the survey lance with the fingers hidden by its guard, the lance pointed screen-right, its tip just igniting with a small hard white-cored glow and a spray of frozen sparks. The glow lights her suit's front and the visor's edge; behind her, black. Salt dust hangs still in the light. No recipient in frame.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Camera holds; the flash blooms and sparks fly screen-right for one second; she holds the brace; then the frame darkens."
What the move needs from this still: the brace as a held pose (pre-tension, not mid-swing); fingers hidden; the glow's fall-off already on the suit.

## D. Punctuation

### C40-R1 · The look back / look-out — R1 from behind at the hatch threshold, blue hour
Goal: farewell or contemplation; the audience looks where she looks  |  Implied motion: hold, then slow push toward the opening (reliable)  |  Risk: safe
Recipe: wide · eye level · normal · figure small on the lower-third crosshair inside the hatch frame, horizon high · blue hour, backlight from the place she leaves, one warm remnant · warm→cool gradient
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A wide shot at eye level: the surveyor seen from behind, small, on the lower-third crosshair, standing inside the frame of the crawler's open hatch, looking out across the salt toward the derelict tower on a high horizon; the hatch's steel edges frame her on both sides. Blue hour: the plain washed in even blue, the tower's top catching one last warm note. Warm remnant on the horizon, the rest cool. Lead room toward the tower.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Camera holds, then a slow push toward the opening; the warm light on the tower fades slightly; nothing else moves."
What the move needs from this still: a frame-within-frame that the push travels through; the back of the figure; the thing looked at visible and far.

### C40-R2 · The look back / look-out — R2 no look back: the empty threshold and boot prints
Goal: absence  |  Implied motion: same (reliable)  |  Risk: safe
Recipe: wide · eye level · normal · the hatch frame, no figure, prints leading out · blue hour, even and shadowless · one warm note, the rest cool
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A wide shot at eye level: the crawler's open hatch seen from inside, its steel edges framing a view of the blue salt plain and the derelict tower on a high horizon, the top of the tower holding the last warm light; the threshold is empty, a single set of boot prints leading out across the salt from the hatch's lip. Blue hour, even and shadowless. One warm note, the rest cool. Nothing moves.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Camera holds, then a slow push toward the opening; the warm light on the tower fades slightly; nothing else moves."
What the move needs from this still: the frame-within-frame; a ground path (the prints) giving the push a direction; no figure at all.

### C41-R1 · The button — R1 eyes inside the visor, the seam's reflection
Goal: the last image is the hero's intent  |  Implied motion: camera still; one slow blink; the reflection pulses once (reliable)  |  Risk: safe (eyes only, no hands, no text)
Recipe: extreme close-up · eye level · long · eyes on the upper-third crosshair · the reflection as the only light; the rest near black · mono + accent
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. An extreme close-up, eye level: the surveyor's eyes inside the raised visor fill the upper third of the frame, open, steady, looking just above the lens; in each eye a small pale blue-green reflection of a glowing seam. The visor's edge and the hood's inner fabric frame the eyes; below, the bridge of the nose falls into soft shadow. The reflection is the only light; the rest near black. No hands, no text.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Camera holds still; she blinks once, slowly; the reflection pulses once; nothing else moves."
What the move needs from this still: both eyes open and sharp; no hand in the same frame; the reflection a soft shape, not letters; symmetric enough to hold through a blink.

### C41-R2 · The button — R2 one legible prop: the sample vial on salt
Goal: same, when the face budget is spent  |  Implied motion: same — the glow pulses once (reliable)  |  Risk: safe
Recipe: close-up · straight-on · normal, shallow · vial centred on its side · flat overcast from above; the glow the only colour · mono + accent
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A close-up, straight on, shallow depth of field: a small glass sample vial lies on its side on cracked white salt, half full of fine salt crystals that give off a faint pale blue-green glow; the vial sharp, the salt beyond it soft. Flat overcast light from above; the glow the only colour in the frame. Centred. Nothing else on the ground. No hands, no labels on the glass.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Camera holds still; the glow inside the vial pulses once; nothing else moves."
What the move needs from this still: the glow already present with fall-off on the salt; a plain ground; no label that could turn into text.

## E. Trailer beats

### C42-R1 · Cold open — R1 one light in the void
Goal: hook with no context; carries music  |  Implied motion: the point of light blooms and grows slowly (reliable)  |  Risk: safe
Recipe: extreme wide / abstract · any · a single cold point lower third, near black around · one source in the void · black + accent
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. An extreme wide frame, near black: a single cold pale blue-green point of light sits on the lower third, slightly left of centre, where a crack in the salt lets the machine's glow through; the crack's edges catch a thin line of the glow, and the faintest grey band of the salt plain is visible around it. Nothing else. The point of light is the only bright thing in the frame.
Motion line (for optional I2V, same for R1 and R2 of this situation): "The light blooms slowly and grows; the camera holds still; nothing else appears."
What the move needs from this still: a single source with a visible fall-off edge to grow from; nothing else in the dark that could be mistaken for a shape.

### C42-R2 · Cold open — R2 macro of the iconic object (cracked visor, warm rim)
Goal: same; genre and craft first  |  Implied motion: same (reliable — a slow bloom on the rim)  |  Risk: safe
Recipe: extreme close-up · macro, shallow · object filling the upper-left two-thirds, dark ground · one warm rim from the right edge, the rest black · slate, salt white, one warm edge
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. An extreme close-up, macro, shallow depth of field: a helmet visor cracked in a star, its pale-grey glass filling the upper-left two-thirds of the frame, salt crystals grown along the crack, on a dark ground; one warm rim from the right edge traces the crack and the visor's curve, everything else falling to black. No face, no hands. Slate, salt white, the one warm edge.
Motion line (for optional I2V, same for R1 and R2 of this situation): "The rim light blooms slowly and grows; the camera holds still; nothing else appears."
What the move needs from this still: texture on the object only; a single light edge to grow; black surround.

### C44-R1 · World beat — R1 foreground object frames the land (three planes)
Goal: depth in one image; "looking out"  |  Implied motion: slow lateral drift / 2.5D parallax (reliable at tiny amplitude)  |  Risk: safe
Recipe: extreme wide · eye level · wide · dark soft foreground a third of the frame, sharp salt, far tower in haze, one small figure · overcast, foreground in shade, distance lit · bone/slate/dust grey
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. An extreme wide shot at eye level with three planes: in the left foreground, dark and soft, the rusted mouth of a fallen pipe section occupies a third of the frame; through and past it, the flat white salt plain, sharp; far off, the derelict tower rising out of pale haze with a single small surveyor walking toward it. Overcast light, the foreground in shade, the distance lit. Bone white, slate, dust grey.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Slow lateral drift to the right; the foreground shifts more than the distance; the small figure keeps walking."
What the move needs from this still: three planes with clean silhouettes and no thin occluders; edge margin for the crop; the figure tiny.

### C44-R2 · World beat — R2 through the cab window at dawn, the tower emerging from fog
Goal: same; the place becomes a character  |  Implied motion: same (reliable)  |  Risk: safe
Recipe: extreme wide · eye level from inside · wide · the window frame around all four edges, the view through · dawn in fog, foreground in deep shade, first warm light on the tower's top · one warm note, cool grey
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. An extreme wide shot from inside the crawler's cab: the cab's window frame, dark, runs around all four edges of the image as a frame within the frame; through the glass, the white salt plain at dawn in thin fog, the derelict tower just emerging as a grey shape, its top catching the first warm light. The glass carries a few dry salt specks. Foreground in deep shade, the distance soft and pale. One warm horizon note, the rest cool grey.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Slow lateral drift to the right; the window frame shifts more than the distance; the fog thins slightly."
What the move needs from this still: a dark foreground frame with clean edges (parallax layer); the distance soft (nothing fine to crawl); no figure.

### C46-R1 · Twist — R1 the quiet wide where sound stops
Goal: the twist is a change of energy, not content  |  Implied motion: camera holds; one grain falls; the cold point pulses once (reliable)  |  Risk: safe
Recipe: extreme wide · eye level · wide · crawler tiny, figure a speck, upper third empty · night-blue even light, no shadows · blue-black + one accent point
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. An extreme wide shot at eye level: night, the whole salt plain and sky washed in one even blue, no shadows; the crawler tiny near the centre with all its lights off; the surveyor a speck beside it; the tower a faint dark vertical on the right; on the ground near the tower's foot one pale blue-green point, the machine's pulse. The upper third is empty sky. Nothing moves. Blue-black and the one cold point.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Camera holds perfectly still; the cold point pulses once; nothing else moves."
What the move needs from this still: a wide that can hold still (give the model the one pulse as its motion budget); an empty upper third for the credit; nothing mid-motion.

### C46-R2 · Twist — R2 same staging as the establish, the figure gone
Goal: the callback is the twist  |  Implied motion: same (reliable)  |  Risk: safe
Recipe: identical to C01-R1 · slightly above eye level · deep focus · the tower on the right third, no figure, boot prints ending · flat overcast · three tonal bands
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. An extreme wide shot from slightly above eye level, deep focus: the same flat white salt plain cracked into plates to a horizon on the lower third, the derelict tower off-centre on the right third with its top in haze — and no figure at all at its foot, only a short line of boot prints ending in the middle of the salt. Flat overcast light, no shadows, the sky the brightest field. Three tonal bands: sky, haze, salt.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Camera holds perfectly still; a thread of dust crosses the prints once; nothing else moves."
What the move needs from this still: the framing to match C01-R1 closely enough to read as a callback; the prints readable; no figure.

### C47-R1 · Climax scale plate — R1 the beam from the iris to the gantry
Goal: one "biggest image" that anchors the montage  |  Implied motion: slow tilt up along the beam (conditional; reliable with the beam's vertical)  |  Risk: safe
Recipe: extreme wide · low angle up · wide · beam centred, figure tiny at its foot, symmetrical arms either side · the beam the only source, haze making it solid; black outside · black + accent + salt-white rims
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. An extreme wide shot from a low angle: a vertical beam of pale blue-green light rises from the open circular hatch in the salt to the derelict tower's ring gantry high above, the beam the only light source, haze making it a solid column; at its foot, tiny, the surveyor in silhouette; either side, two segmented dark pipe-arms standing as symmetrical verticals. Everything outside the beam falls to near black; salt-white rims where the light grazes. Subject on the centre line.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Slow tilt up along the beam from the figure to the gantry; the beam shimmers; the arms stay still."
What the move needs from this still: a strong vertical continuing past the top edge; the figure tiny and static; the arms plain verticals, no fine texture.

### C47-R2 · Climax scale plate — R2 hero centred before the open iris, limbs mirrored
Goal: same; symmetry pre-echoes the title lock  |  Implied motion: same — here a slow push (reliable)  |  Risk: safe
Recipe: extreme wide · eye level, symmetrical · wide · figure centred and small, hatch pouring light toward camera, arms mirror images · the hatch the only source; silhouette · near black + accent + salt-white grazes
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. An extreme wide shot at eye level, symmetrical: the surveyor stands centred and small before the circular hatch of the buried machine, which has opened and pours pale blue-green light toward camera across the salt; on each side, at equal distance, a dark segmented pipe-arm rises from the ground, the two arms mirror images. The light from the hatch is the only source; her figure a dark silhouette against it. Near black beyond. Salt-white where the light grazes the plates.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Slow push-in toward the figure and the open hatch; the light breathes once; the arms stay still."
What the move needs from this still: symmetry that survives a push; the figure a silhouette (no face); the light's fall-off on the salt as the parallax plane.

### C48-R1 · Title reveal — R1 the held world plate with an empty upper third
Goal: name the thing on a quiet plate (title is post)  |  Implied motion: light bloom, settle (reliable)  |  Risk: safe
Recipe: extreme wide · slightly low · wide · tower on the right third ending below the upper third; upper third plain sky; two small shapes lower left · overcast, sky brightest · bone/slate, one faint warm tone
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. An extreme wide shot, slightly low angle: the derelict desalination tower stands on the right third on a flat white salt plain, its salt-crusted base and ring gantry readable, its top ending below the upper third; the upper third is plain overcast sky, even and empty; the surveyor and crawler are two small shapes at the lower left. Overcast light, the sky the brightest field. Bone white, slate grey; one faint warm horizon tone. Clean surfaces, no signage.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Camera holds; the light behind the tower blooms gently, then settles; nothing else moves."
What the move needs from this still: a truly empty upper third (no haze detail that fights a title); nothing mid-motion; the bloom's source (sky) already the brightest field.

### C48-R2 · Title reveal — R2 key-art lock: frontal, centred, the iris as a halo
Goal: the trailer ends on the poster  |  Implied motion: same (reliable)  |  Risk: safe (visor down — no face)
Recipe: medium · eye level, symmetrical · normal · figure frontal centred, the open hatch as a round halo behind · the halo the only source; edges rimmed, front in soft shadow · slate, salt white, one cool hue; lower third dark and empty
Prompt (Lucid Realism / Lucid Origin — prose):
A photograph — a single film still. Muted grade: bone white, slate grey, dust grey, at most one faint warm note; fine light grain, soft highlight roll-off. 35–50mm lens family: natural perspective, moderate depth of field unless stated. A medium shot at eye level, symmetrical: the surveyor stands frontal and centred, hood up, visor down and reflecting a ring of pale blue-green light; directly behind her head and shoulders, the circular open hatch of the machine glows as a round halo of the same light, the only source; her suit's front is in soft shadow, edges rimmed. The lower third of the frame is dark empty salt; the corners fall to black. Slate, salt white, one cool hue.
Motion line (for optional I2V, same for R1 and R2 of this situation): "Camera holds; the halo blooms gently, then settles; she does not move."
What the move needs from this still: strict symmetry; the visor down (no face to drift); a dark empty lower third for the title; the halo's edge soft enough to bloom.
