<!--
SCORE-PROMPT — the text engine's instructions for drafting a closed ScoreSpec.
Read by lib/sound/localScore.ts (scorePrompt). A change here is a code change.

Structure: the code keeps the `shared` section, then the `music` section, then
substitutes the {{...}} slots. Everything outside a section marker is never sent.

Every drafted JSON object is validated at the door by `parseScoreSpec`
(@gt/domain/audio.score): out-of-key MIDI notes, unknown or A0-refused
instruments, and out-of-range controls are rejected before the Python sidecar
is ever called.
-->

<!-- section: shared -->
You are drafting a deterministic local `ScoreSpec` (`v: 1`) for the Local Band engine (`box.render`, `$0` local VST3 + sample stem renderer).

THE BRIEF, verbatim from the operator:
"""
{{IDEA}}
"""

Return a single JSON object matching `ScoreSpec`:
- `v`: `1`
- `title`: 1..120 characters naming the cue.
- `style`: one of {{STYLES}}.
- `seed`: integer `0..2147483647` so every render is bit-identical (`maxAbsDiff === 0.0`).
- `tempoBpm`: `40..220`.
- `key`: one of {{KEYS}}.
- `loop`: boolean (`true` for seamless repeating loop, `false` for multi-section cue with tail fade).
- `controls`: `{ "density": 0..1, "brightness": 0..1, "lift": 0..1, "swing": 0..0.5, "humanise": 0..1 }`.
- `sections`: 1..8 sections, each `{ "name": string, "bars": 1..32, "energy": 0..1, "progression": [0..6] }` with total bars in `2..64`.
- `tracks`: 1..4 tracks covering distinct roles from `["drums", "bass", "chords", "lead"]`.

Answer with JSON only, matching the schema. No prose before or after.

<!-- section: music -->
LOCAL BAND INSTRUMENT & HARMONY RULES:
- Choose each track's `instrument` ONLY from the A0-verified ready instruments for that role:
{{READY_INSTRUMENTS}}
- Never select a refused or silent plugin (`minigrand-vst3`, `hybrid-vst3`); `parseScoreSpec` refuses them at the door.
- Set `gainDb` in `-24..12` and `pan` in `-1..1`. Keep `drums` and `bass` centred (`pan: 0`) so low-end phase correlation stays clean.
- When a piece has 2 or more sections (`intro` -> `lift` -> `outro`) and `loop: false`, give the `lift` section at least `+0.40` higher `energy` than `intro` and `controls.lift >= 0.65` so the arrangement clears the `flat-section-contrast` triage detector (`>= 3 dB` RMS step).
- If a non-drum track includes explicit `notes` (`{ "bar", "beat", "durationBeats", "midi", "velocity" }`), every `midi` pitch MUST belong to the declared `key` scale and stay within the chosen instrument's `[minMidi..maxMidi]` range. `parseScoreSpec` refuses any note that leaves the declared key.
