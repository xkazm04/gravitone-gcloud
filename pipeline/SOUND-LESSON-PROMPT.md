<!--
SOUND-LESSON-PROMPT — the text engine's instructions for drafting ONE lesson
from a finished Hunt. Read by lib/sound/hunt.ts (lessonPrompt). A change here
is a code change.

The engine drafts; it never stores. The draft goes back to the operator, who
edits or discards it, and only their confirm writes a lesson to the ledger
(lib/sound/ledger.ts appendLesson). The evidence numbers (n, keep rate, mean
score, take ids) are computed by the code from the takes, NOT by the model —
the model is asked only for the claim, the techniques it rests on, and the
provider, so a fluent paragraph cannot launder an n=1 into a rule.

Everything above the section marker is never sent.
-->

<!-- section: shared -->
A person ran a HUNT — one problem, several variations rendered and auditioned side by side — and marked winners. Draft the ONE lesson the results support about how to brief a {{KIND}} generator.

THE PROBLEM, verbatim:
"""
{{IDEA}}
"""

THE RESULTS. Each line is one rendered variation: the branch axis it varied, its label, provider, techniques, the prompt it was briefed with, and how the person judged it (WINNER, kept, rejected with defect codes, or unjudged), with its rubric mean where scored:
{{RESULTS}}

Write the claim as ONE sentence of the form "when X, brief Y, because Z":
- X is the situation (the kind of problem, not this exact idea).
- Y is the method that won — the technique, the vocabulary choice, the provider, the structure — stated concretely enough to apply tomorrow.
- Z is what the winners did that the losers did not, as heard: cite the defect codes the losers carried where they explain it.
- Claim only what the winners-versus-losers contrast shows. If the contrast is one take against one take, say "in one hunt" inside the sentence rather than stating a law.
- At most 40 words. No hedging filler, no praise.

Also give:
- `technique`: the briefing technique slugs the claim rests on, ONLY from: {{TECHNIQUES}}. Empty if the lesson is not about a technique.
- `provider`: the provider the lesson is about (`elevenlabs`, `suno`), or null if it holds across providers.

Answer with JSON only, matching the schema.
