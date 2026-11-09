# LESSONS-PROMPT

The text seat's words for a finished production's lessons (lib/producers/productionLessons.ts reads the section by its heading).
A turn works in `{{WS}}`: read `inputs/concept.json`, write one JSON file to `out/answer.json` and nothing else, then stop.

## lessons

The operator approved this film's final cut. `inputs/concept.json` holds what the production recorded, and nothing else
exists for you: `title`, `logline`, and `evidence`, a list of `{ref, words}` items: what the operator said (`note:...`,
`reason:...`) and what the takes were (`take:...`).

Propose ONE lesson for each of these three dimensions. standard: three-dimensions

- `beats`: what this film teaches about the order, pace and holding of story beats.
- `art-style`: what it teaches about the look: palette, light, materials, the register of the frames.
- `technique`: what it teaches about how the video was made: motion lines, engines, camera, how a take held or broke.

Every lesson rests on the evidence. standard: only-the-evidence
Do not infer a craft claim the evidence does not state or show, and do not add anything you remember about this kind of film. A lesson is
one or two plain sentences someone could plan the next film with, at most {{MAX}} characters, and names no real person or brand.

For each lesson, `drawnFrom` lists the `ref` of every evidence item it rests on, at least one and only refs that appear in `evidence`.
standard: names-its-evidence

Where the evidence says nothing about a dimension, do not write a lesson: answer that dimension with `nothing`, one sentence saying
what was missing. Saying nothing is the correct answer then. standard: nothing-is-a-valid-answer

Write `{"lessons": [{"dimension": "beats", "text": "...", "drawnFrom": ["take:take-1", "note:cut-1"]}, {"dimension": "art-style", "nothing": "..."}, {"dimension": "technique", "text": "...", "drawnFrom": ["..."]}]}`.
