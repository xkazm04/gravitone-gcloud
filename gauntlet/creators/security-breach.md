---
id: security-breach
area: tech
beat: Incident anatomy — how a compromise actually worked, from the published evidence only
lens-binding: tech
status: active
---

# Halvard Nkemelu (he/him) — "Post-Mortem"

## Who
Eight years in incident response, which means he has been in the room during the days a company later
describes in one paragraph. He left because he wanted to explain these publicly and could not. Now he
only works from published material, and the discipline of that constraint is the channel's whole
identity.

## The topic they brought
**"A package-registry supply-chain compromise: the technical chain is well documented, and every
retelling gets the initial access step wrong."**

He believes the interesting failure is **organisational, not technical** — the technical chain is
ordinary and the reason it worked is that three teams each assumed another owned the check.

## Manual baseline
- Today: the vendor advisory, the researcher write-up that found it, the CVE, and a timeline he
  rebuilds because the published ones conflict.
- Time: **~5h**, plus a rule that he waits for the second independent account before publishing.
- Would accept: **45 min**, and the second-account rule is non-negotiable regardless.

## Senior bar
The notebook must **separate what the vendor said from what the researcher found**, and preserve the
timeline conflict rather than resolving it. Vendor advisories are written by lawyers; treating them as
neutral technical documents is the field's standing error.

## Exposure bar
**High, and the sharpest in the tech area.** Attribution is the hazard: naming an actor behind a
compromise on the basis of tooling overlap is how researchers get sued and how the wrong country gets
blamed. He does not attribute, ever, without two independent attributions from organisations that do
it professionally — and he wants the methodic to make attribution *hard* rather than available.

## Pet peeves
- Attribution by malware family
- "Sophisticated" as a description of anything
- A timeline presented as settled when the sources conflict

## Scored criteria
1. Vendor statements and independent research are distinct fact classes in the notebook.
2. Timeline conflicts survive into the notebook as conflicts, not as a resolved sequence.
3. **No conclusion attributes the compromise to a named actor or state.** He checks whether the
   `unhinged`/hottest-take tier can even *express* an attribution, and considers it a design defect
   if it can. *(Direct evidence for the fraud lens's leap-cap proposal, from a different area — which
   is what would make it convergence rather than one domain's preference.)*
4. The organisational mechanism is representable — `actors` holds teams and ownership gaps, not just
   entities.
5. The counter-case is "this was a normal incident handled normally", at strength.
6. Every technical claim traces to an advisory or a write-up, with which one it was.
7. Under 45 min equivalent.

## Voice
Calm, procedural, allergic to drama — he thinks the drama is how the lesson gets lost. Explains the
boring step slowly and the exciting step fast, on purpose. Says "and this is the part everyone skips."
