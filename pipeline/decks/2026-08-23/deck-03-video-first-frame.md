# Deck 03 — Video first frame (still built to move)

**Aspect:** 16:9 (set as a parameter — and it must equal the clip's aspect if you take a still
into an I2V tool). **Rolls:** 2 per side. **Provider:** one image provider for the whole deck.

Each pair gives an **image prompt A / B** plus ONE **motion line** shared by both sides. Judge
the stills first, as stills: "which of these do I believe will move well?" Then, optionally, put
one A and one B keeper into any I2V tool you have (Veo 3.1 Fast, Kling, Wan, Runway, LTX…) with
the motion line unchanged, and judge the clips. The still is the variable; the motion line is not.

Rules here come from the image-to-video dossier's first-frame checklist and the creators' keyframe
doctrine ("prompt the physical consequence of motion, not the motion").

Concept for the whole deck — **"HALO OF SALT"** (sci-fi, from Deck 02): the surveyor, the salt
bed, the derelict tower. A shared **LOOK** line is used verbatim in every still, both sides:

```
LOOK = A photograph. Late overcast daylight from behind the tower; thin haze in the far distance.
Muted grade: bone-white ground, slate-grey steel, one faint warm tone near the horizon. 35mm lens,
moderate depth of field, background readable.
```

---

## V03-01 · Motion word vs physical consequence of motion
**Rule under test:** a still cannot hold a verb, only its consequence — prompt the residue of motion (streaked dust, lifted heel, fabric pulled) not "running"/"moving" (creator rule 12; I2V motion-ready cue).
**Motion line (shared):** `The surveyor runs left to right across the salt bed; camera holds static.`

**A (verb in the still)**
```
LOOK
A medium-wide shot of the surveyor running across the white salt bed, the derelict tower in the background. She is moving fast.
```
**B (consequence in the still)**
```
LOOK
A medium-wide shot of the surveyor caught mid-stride on the white salt bed, the derelict tower in the background: back heel lifted, weight on the front foot, torso leaning into the direction of travel, a low skirt of salt dust kicked up behind the trailing boot, the suit's hood pulled back by her own speed. Pin-sharp subject.
```
*What the rule predicts:* B has a pose the I2V model can continue; A is a posed "runner" with no momentum, or blurred. (Also check: did A bake in motion blur? That is a hard fail for I2V.)

---

## V03-02 · Lead room in the direction of the move
**Rule under test:** leave empty frame on the side the subject or camera will travel into; a centred subject has nowhere to go (I2V first-frame soft check: lead room / headroom).
**Motion line (shared):** `The surveyor walks slowly to the right; camera tracks with her at the same speed.`

**A (centred)**
```
LOOK
A medium shot of the surveyor standing on the salt bed, centred in the frame, facing right, the tower behind her on the left.
```
**B (lead room)**
```
LOOK
A medium shot of the surveyor standing on the salt bed in the left third of the frame, facing right, with the right two-thirds of the frame open salt and sky for her to walk into; the tower behind her on the far left edge.
```
*What the rule predicts:* B moves cleanly; A either crowds the right edge or the model invents a pan. As stills, judge whether B's off-centre framing still feels composed.

---

## V03-03 · Texture budget
**Rule under test:** high-frequency detail suppresses motion; prefer broad tonal regions and a plain background for anything that must move (I2V C4/C5, ALG paper; trailer "≤2 subjects, low detail" convergence).
**Motion line (shared):** `Slow push-in toward the surveyor; the wind lifts a thin veil of salt dust across the ground.`

**A (dense)**
```
LOOK
A medium-wide shot of the surveyor standing on the salt bed; behind her, the tower's base is a dense lattice of rusted pipes, valves, gantries and cables, every surface corroded and detailed, the ground covered in small scattered debris and fine cracks.
```
**B (broad regions)**
```
LOOK
A medium-wide shot of the surveyor standing on the salt bed; behind her, the tower's base is a few large plain slabs of grey steel, broad and simply lit, the ground a flat white plate with a handful of wide cracks. Large tonal regions, minimal fine detail.
```
*What the rule predicts:* B moves (push-in + dust) without the background crawling; A shimmers or freezes. As stills, A may look "richer" — note if you prefer it anyway; that's the trade-off to record.

---

## V03-04 · Subject count
**Rule under test:** ≤2 primary subjects in a first frame; crowds morph (I2V hard fail: >2 subjects).
**Motion line (shared):** `The figures turn their heads toward the tower; a low rumble; camera static.`

**A (crowd)**
```
LOOK
A wide shot of seven members of the survey team in grey thermal suits standing in a loose group on the salt bed, facing the camera, the tower behind them.
```
**B (two)**
```
LOOK
A wide shot of two members of the survey team in grey thermal suits standing a few paces apart on the salt bed, facing the camera, the tower behind them.
```
*What the rule predicts:* B's two heads turn; A's crowd smears, swaps faces, or only some turn. As stills, count limbs and faces in A.

---

## V03-05 · Lighting that survives motion
**Rule under test:** one readable light direction, no hard cast shadows that would have to travel, no extreme bokeh unless the end frame shares it (I2V C3; cinematography 26).
**Motion line (shared):** `Slow orbit a quarter turn around the surveyor, left to right; she stays still.`

**A (hard light, hard shadows, extreme DoF)**
```
A photograph. Hard low sun from the right throwing a long sharp shadow of the surveyor across the salt; 85mm at f/1.4, extreme shallow depth of field, the tower a smear of bokeh. A medium shot of the surveyor standing on the salt bed.
```
**B (LOOK — soft single source, moderate DoF)**
```
LOOK
A medium shot of the surveyor standing on the salt bed, the tower readable behind her.
```
*What the rule predicts:* B orbits without the shadow and bokeh tearing; A produces a shadow that slides and a background that pops in and out of focus. As stills, A will likely be the prettier image — record that honestly.

---

## V03-06 · The face rule
**Rule under test:** when a face would carry the emotion, fragment or hide it (silhouette, contre-jour, hands/objects) unless identity is the point; faces are the least stable element in I2V (creator rule 14; I2V shadowed-face hard fail for the *other* case).
**Motion line (shared):** `She slowly raises the sample vial to the light; camera static.`

**A (face-forward emotional close-up)**
```
LOOK
A close-up of the surveyor's face, front-on, eyes wet, lips parted, looking at a small glass sample vial she holds just below her chin.
```
**B (fragmented — hands and object, face implied)**
```
LOOK
A close-up of the surveyor's gloved hands holding a small glass sample vial up against the grey sky, her face out of frame above, only the edge of her jaw and the hood visible at the top edge. Emotion in the hands: fingers tight, the vial tilted as if being read.
```
*What the rule predicts:* B animates cleanly and still carries the beat; A's face drifts or goes uncanny when it moves. As stills, A may be more "emotional" — note which you'd rather build a trailer beat around.

---

## V03-07 · Three depth layers with jobs
**Rule under test:** give the keyframe three depth layers each with a job — foreground frames, midground acts, background holds the stakes — so the I2V model has parallax and an affordance (creator rule 13, keyframe seven-liner).
**Motion line (shared):** `Slow dolly forward through the foreground; the tower looms larger.`

**A (flat description)**
```
LOOK
The surveyor walks toward the derelict desalination tower across the salt bed.
```
**B (three layers, each with a job)**
```
LOOK
Foreground, frame-left, soft: the rusted edge of a fallen pipe section, close to camera, framing the shot. Midground, sharp: the surveyor, back to camera, mid-stride toward the tower, small in frame. Background, vast: the derelict desalination tower rising out of the haze, its top cut off by the frame edge — the thing she is walking into. Three clearly separated planes.
```
*What the rule predicts:* B dollies with real parallax and a sense of scale; A is a flat plate that the model zooms. As stills, B should look "designed".

---

## V03-08 · Motion in the image prompt vs motion in the motion line only
**Rule under test:** the still is the locked layer — it carries every look decision and NO motion instruction; the video prompt carries only change (I2V C1; cinematography 26). Putting camera moves into the image prompt gives the image model something it can't do and often yields blur, bars or odd crops.
**Motion line (shared):** `Slow push-in on the surveyor; the hood fabric ripples; dust drifts right to left.`

**A (motion words inside the image prompt)**
```
LOOK
A medium shot of the surveyor standing on the salt bed, the camera slowly pushing in toward her as the wind ripples her hood and dust drifts across the ground from right to left.
```
**B (held pose, nothing moving in the still)**
```
LOOK
A medium shot of the surveyor standing still on the salt bed, facing camera, hood up and already caught by a steady wind from the right so the fabric is pulled taut toward the left; a thin layer of salt dust lying low on the ground to her right. Headroom above, room at the sides. Sharp throughout.
```
*What the rule predicts:* A comes out with motion blur, a weird crop, or letterbox bars; B is a clean still whose wind-pulled hood gives the I2V model a direction to continue. As stills, B should simply be the better photograph.
