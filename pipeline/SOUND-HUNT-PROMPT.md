<!--
SOUND-HUNT-PROMPT — the text engine's instructions for drafting a Hunt map.
Read by lib/sound/hunt.ts (huntPrompt). A change here is a code change.

Structure: the code keeps the `shared` section, then the section for the hunt's
kind (`music` or `sfx`), then substitutes the {{...}} slots. Everything outside
a section marker (this comment included) is never sent.

Sources for the rules below, quoted rather than paraphrased where they bind:
ai-registry knowledge/media-generation/audio-generation/
  music-prompt-composition (golden path + sonic-style-vocabulary,
    section-plan-as-the-brief, duration-and-tempo-locking, reference-track-anchoring)
  sound-effect-generation (golden path + envelope-first-briefing,
    layered-element-assembly, loop-seam-acceptance)
-->

<!-- section: shared -->
You are drafting a HUNT: a map of variations to audition against one problem. A person will listen to the renders side by side and mark winners, so every leaf must be a prompt a generator can execute exactly, and every branch must vary ONE thing so a winner says which choice mattered.

THE PROBLEM, verbatim from the operator:
"""
{{IDEA}}
"""

Kind: {{KIND}}.

Draw the map as 3 to 6 BRANCHES. A branch is one AXIS OF VARIATION — technique, genre, instrumentation or palette, tempo and key, duration or structure, provider. Name the axis in one or two words. Give each branch 2 to 4 LEAVES. Within a branch, leaves differ on that branch's axis and hold everything else as close to equal as the axis allows; across branches, cover different axes. Do not make two branches vary the same axis.

Each leaf carries:
- `label`: what this leaf tries, in at most six words.
- `rationale`: one sentence — why this choice might solve the problem. No filler.
- `provider`: `elevenlabs` (rendered here, metered) or `suno` (a manual round trip: a person pastes the prompt into Suno and brings the file back). Use `suno` only where its dialect is the point of the leaf (a style line plus section tags, vocal-led pieces); otherwise `elevenlabs`.
- `technique`: the briefing technique(s) the prompt applies, ONLY from this list: {{TECHNIQUES}}. Name every one the prompt actually uses; name none it does not.
- `prompt`: the full prompt, ready to send. Concrete vocabulary, never adjectives standing in for decisions.
- `negative`: what must NOT appear, comma-separated, or null.
- `durationS`: seconds, {{DURATION_MIN}} to {{DURATION_MAX}}.
- `terms`: what the prompt names, as lists of plain words a person would file it under — `genre`, `mood`, `instrument` (each a list; empty when the prompt names none) and `sfxCategory` (one word for an effect's family, e.g. "impacts", "whooshes", "ambiences", "ui"; empty for music). Name only what the prompt itself says.
- `tempoBpm`, `key`, `loop`: see the rules for this kind below. They state what the prompt asks for as fields, so they must agree with the prompt text exactly.

What this studio has already measured about each provider (MEASURED rows only, each with its n; empty means nothing has cleared the evidence floor yet — then explore, do not pretend to know). Lean on a strength where it fits the problem, and put at least one leaf on the strongest measured choice when one applies; spend the other leaves exploring:
{{STRENGTHS}}

Lessons this team has confirmed (each a person's claim with its evidence). Treat them as standing rules unless the problem is exactly where one would not apply:
{{LESSONS}}

Answer with JSON only, matching the schema. No prose before or after.

<!-- section: music -->
MUSIC RULES (registry: music-prompt-composition):
- Style is layered vocabulary, stated in both directions. A style directive names genre and era, mood and energy, instrumentation, and production character, "each named in words the training distribution actually carries". "Cinematic" is not a style; it is an evasion. When a result would be generic, add axes before adding adjectives.
- Always fence the side you cannot see: every music leaf that must have no singer says "instrumental" in the prompt and puts vocals in `negative` — "the most common failure of an underscore brief is one word long: forgetting 'instrumental', and receiving a singer."
- The opening of the piece is the anchor: state the piece's identity first; later sections say only what changes.
- A piece that will be reviewed, revised or cut against picture is briefed as a plan (`section-plan-as-the-brief`): name the sections with their seconds inside the prompt ("Intro 8s: … / Build 16s: … / Release 12s: …"). For exploring identity with disposable candidates, a short prose prompt (`single-sentence` or `tag-list`) is honest.
- Lock tempo only when something depends on the interior (`duration-and-tempo-locking`); when the problem names a length or a hit point, state the duration and the BPM in the prompt and keep the leaf's `durationS` equal to it.
- A reference carries palette, energy and production character — never melody; name what to take from it in vocabulary (`reference-track-anchoring`), and never ask for "in the style of" a named commercial artist.
- Lyrics only if the problem asks for a voice (`lyrics-for-singability`): syllable load must fit the tempo.
- Durations: a sting or loop is 3–15 s, a bed 20–60 s, a cue or a full piece 60–180 s. Default to the shortest length that answers the problem: every second is metered.
- Fields for every music leaf: `terms.genre`, `terms.mood` and `terms.instrument` carry the genre, mood and instrumentation words the prompt uses; `terms.sfxCategory` is empty. `tempoBpm` is the BPM the prompt states, or 0 when it states none; `key` is the key the prompt names ("D minor", "Ab major"), or "" when it names none. `loop` is false — a music leaf is never an effect loop.

<!-- section: sfx -->
SOUND EFFECT RULES (registry: sound-effect-generation). A sound effect "is not a small piece of music": it has no sections, no tempo, no key, no lyric — it has an ENVELOPE.
- Describe the event, not the emotion. Every effect prompt is envelope-first (`envelope-first-briefing`) and states, in this order: EVENT (material and action), ATTACK (sharp, soft, swelling), BODY (tonal, noisy, resonant), TAIL (dry stop, long ring, reverse), SPACE (distance and room: dry, roomy, vast). "A scary sound" returns the modal answer; "heavy iron door slams, sharp metallic attack, short dry room, no ring" is executable.
- Duration is stated, not hoped: 0.5–30 s. A one-shot hit is 0.5–3 s, a whoosh or riser 1–6 s, an ambience bed 10–30 s. Put the length in the prompt as well as in `durationS`.
- A sound that must satisfy more than one quality axis (weight AND definition AND size) is better asked for as LAYERS (`layered-element-assembly`): make leaves for the low, the transient and the air element separately, each a simple one-element prompt, rather than one composite.
- An ambience that will repeat is a LOOP: say "seamless loop" in the prompt, keep the body featureless at the joint, and tag `loop-seam-acceptance`. One-shot events never loop.
- A hit that must land on a picture event states its exact length and a dry tail (`picture-as-timing-brief`).
- Never give an effect a key or a tempo — "the tell is that the brief wants a key"; that is music, not an effect.
- `provider` for effects is `elevenlabs` unless the problem explicitly asks for a Suno round trip.
- Write every effect prompt in LABELLED form, the fields in this order, separated by semicolons: `event: …; material: …; attack: …; body: …; tail: …; space: …; duration: …s; loop: yes|no`. Leave out a field that does not apply (a synthetic UI tone has no material), but always keep `event`, `space`, `duration` and `loop`. Example: "event: heavy iron door slams shut; material: iron, oak frame; attack: sharp; tail: dry stop; space: short stone corridor; duration: 1.5s; loop: no".
- Fields for every effect leaf: `loop` is true exactly when the prompt says `loop: yes`; `terms.sfxCategory` is the effect's family in one word; `terms.mood` may carry a mood word the prompt uses; `terms.genre` and `terms.instrument` are empty; `tempoBpm` is 0 and `key` is "" — always.
