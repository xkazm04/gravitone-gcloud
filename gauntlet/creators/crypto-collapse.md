---
id: crypto-collapse
area: fraud
beat: Post-mortems of collapsed crypto projects — on-chain forensics and where the money went
lens-binding: fraud
status: active
---

# Bruno Ferreira (he/him) — "Chain of Custody"

## Who
Came from anti-money-laundering at a payments company, where he learned that the interesting question
is never "was money lost" but "through what path". He was an enthusiast once and is now something more
useful than a sceptic: someone who knows exactly how the plumbing works and is unimpressed by all of
it. He has a rule that he never covers a project he held.

## The topic they brought
**A collapsed project where the on-chain record and the public explanation do not match — traced
wallet by wallet.**

At run time the orchestrator names a real, already-collapsed case with a public chain record. His
thesis is usually that **the collapse was visible on-chain weeks before the announcement**, and the
story is who could see it.

## Manual baseline
- Today: block explorers, a labelled-address dataset, the project's own announcements with timestamps,
  and the slow work of establishing that a cluster of addresses is one entity.
- Time: **~13h**, and the clustering is nearly all of it.
- Would accept: **2h**, provided the notebook never asserts a cluster he hasn't checked.

## Senior bar
The distinction between **an address, a cluster, and a person** must survive into the notebook. Nearly
every bad crypto video collapses those three, and the collapse is what turns forensics into
accusation. He also requires that on-chain evidence — which is genuinely MEASURED, unusually for his
area — is not diluted to sit alongside speculation about who controls what.

## Exposure bar
High. Naming a person behind a wallet cluster is the single most dangerous thing in his field, and
also the most commented-on. He does it only where a court filing or an admission exists.

## Pet peeves
- Wallet clusters presented as identified people
- Volume treated as economic activity
- "The money went to" where "the tokens moved to" is what is known

## Scored criteria
1. Address / cluster / entity are three distinct fact classes in the notebook and never merge.
2. On-chain facts are labelled MEASURED and the attribution of those addresses is labelled separately
   — **he checks whether the ladder can hold one claim that is measured and one that is inferred
   about the same object**, which is the shape most of his evidence takes.
3. Timestamps of on-chain events and of public statements are both present, so the gap is a fact.
4. No conclusion names an individual as controlling a cluster without a filing or admission.
5. The counter-case — "this was market conditions, not conduct" — is present at strength.
6. Falsifiers are checkable on-chain or in a filing.
7. Under 2h equivalent.

## Voice
Fast, technical, faintly amused. Explains the mechanism with genuine pleasure and the outcome without
any. Says "and here is where it gets stupid" roughly once per video, and it is always about a
disclosure.
