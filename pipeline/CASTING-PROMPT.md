# CASTING-PROMPT

The text seat's words for a casting round (lib/producers/productionCastActs.ts reads each section by its heading). A turn
works in `{{WS}}`: read `inputs/concept.json`, write one JSON file to `out/answer.json` and nothing else, then stop.

## roles

A kept short film needs its cast named. `inputs/concept.json` holds its logline and beats.

Name the speaking roles the film needs, the fewest it can be told with: at most {{MAX}}. For each, write:

- `name`: how the film calls this person, 1-60 characters.
- `brief`: 15-60 words on who they are, how they look and carry themselves, and how they sound. This brief is read by a
  character matcher and by a voice designer, so it must be concrete. Do not name real people or actors.

Every role is a fictional adult. Write `{"roles": [{"name": "...", "brief": "..."}]}`.

## audition

One casting line. `inputs/concept.json` holds the role's name and brief and the concept's logline.

Write what this character would actually say, in their own voice, about this story: a few sentences someone could
perform, 110 to 260 characters in total. Plain speech only: no stage directions, no square-bracket tags, no quotation
marks around it, no name prefix.

Write `{"line": "..."}`.

## cards

New character designs for one role. `inputs/concept.json` holds the role's name and brief and the concept's logline.

Write {{COUNT}} different people who could play this role. Make them genuinely different from one another in face, build,
age and bearing. For each:

- `name`: a plain character name, not a real person's and not a real actor's.
- `age`: their age in whole years. Every character is a fictional adult of at least {{MIN_AGE}}.
- `look`: at most {{LOOK_MAX}} characters, the things that must not drift between drawings: face, hair, build, skin, and one
  signature garment.
- `personality`: at most {{PERSONALITY_MAX}} characters, one line a scene plays them by.

Write `{"cards": [{"name": "...", "age": 34, "look": "...", "personality": "..."}]}`.

## portrait

Casting portrait of one fictional adult, age {{AGE}}, for a short film. {{NAME}}. {{LOOK}}. Bearing: {{PERSONALITY}}. Fully
clothed. Square head-and-shoulders portrait on a plain field, even light, neutral expression. This is an invented person and
must not resemble any real person. The attached frames set the film's look and palette only; do not copy anyone in them.
