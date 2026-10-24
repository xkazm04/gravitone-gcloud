<!--
THE EXPLAINER ADDENDUM - appended after the strip author's and fixer's prompts (lib/foundry/strips/
author.ts `prepareTurn`) when the strip is one card of an explainer (lib/producers/stripCards.ts).
It ADDS to inputs/CONTRACT.md and rewrites none of its rules: the brief here has no steps, and the
turn writes a third file. Comments are stripped before it is sent (lib/foundry/strips/brief.ts).
Pinned by pipeline/strip-explainer-regression.mts (`npm run check:strip-explainer`): the bounds
below are read off the code, and the worked example goes through the caption's door.
-->
## This strip is one card of an explainer

`inputs/brief.json` is one section of an article, not a researched data brief. Its `notes` say which
section. Its `facts` are that section's own sentences. Its `steps` list is empty on purpose.

1. **Derive the steps.** Read every fact, then write 3 to 6 causal steps the section argues, in the
   order it argues them. Each step is a short label made only of words from the facts. These are the
   brief's `steps` for every rule in the contract: draw them as the edu lane's causal chain, and put
   no label on screen that is not a step or a fact.
2. **Write the caption.** Besides `out/strip.html` and `out/style.json`, write a third file,
   `out/caption.json`, holding exactly one key:

   ```json
   { "caption": "A Roman aqueduct needs no pumps. Spring water enters a covered channel and falls about twenty five centimetres every kilometre, so gravity alone carries it fifty kilometres. Where the valley drops away, a three tier bridge holds the channel high and the water keeps flowing to the city." }
   ```

   - It is the narration spoken over this card while it is on screen: 30 to 60 words.
   - Words only from the section: no fact, number or name the facts do not carry.
   - Spoken register: plain sentences. No markdown, no lists, no quotation of headings, and nothing
     that points at the picture ("the figure", "shown above", "on screen") - say the thing itself.
   - Write numbers the way a narrator would say them.

A missing `out/caption.json`, or a caption outside 30 to 60 words, fails the lint: the strip is not
rendered and you will be shown the finding to fix. A fix turn finds the current caption in
`out/caption.json`; change it only if a finding names it or the strip's steps changed.
