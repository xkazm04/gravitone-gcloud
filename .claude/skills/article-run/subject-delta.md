# Subject delta: what a run's research is worth to the registry

A read-only brief for one subagent per gated run. It measures, skeptically, whether the run's
claims would change the registry's own knowledge of the subject. It exists because the article
is not the vehicle: 2026-10-14, eight runs, the research step cost $4 to $6 of a $51 to $67 run
and the critique the rest, and only the research can improve the registry.

Fill `<SUBJECT>` (`bundle/slug`), `<RUN_DIR>` (absolute) and `<REPORT>` (an absolute path in the
scratchpad), then pass the text below the line as the agent's prompt. One agent per run.

Measured on 2026-10-14 over eight runs: two subjects whose facts are set by vendors (model
pricing, ad-platform rules) yielded four HIGH corrections; four stable subjects yielded
additions of MEDIUM value and no corrections. Expect that spread, and spend on the first kind.

---

You are measuring, skeptically, whether an article-pipeline run's research would genuinely
improve the ai-registry. Default to "no" unless the evidence forces "yes". You may NOT edit,
create or delete any file in either repo or run state-changing git commands. Your only write
is the report file named at the end.

SUBJECT: `<SUBJECT>`
Run dir: `<RUN_DIR>` (claims.json = list of {text, source}; the source number indexes
sources.json rows {n,url,title,publisher,date,primary,counter,took}; post\post.md is the
article; patches.json holds patches the run already proposed - note them, still judge
independently).
Registry (current origin/main, fetch and fast-forward it first if it is behind): the checkout
at `registry.local` in `.ai/manifest.yaml`. Resolve the subject through
`knowledge\<bundle>\index.json` -> `subjects["<slug>"].file` (the golden path); its
`techniques\` and `applications\` folders sit beside it. Read the golden path fully, every
technique and application title, and those relevant to the claims. Run
`node scripts/check-currency.mjs --volatile --subject <slug>` in the registry: it lists the
registry's own dated facts by line, which is the list to check the claims against. Read
`rules\ai-registry-access.md` for the layer rules (golden path and techniques: no repo paths,
file extensions or product names; applications may name a stack; numbers carry their n and
date).

METHOD
1. Read the registry material first, completely.
2. Classify ALL claims: CONFIRMS / EXTENDS / CONTRADICTS / OUT-OF-SCOPE. Report counts.
3. From EXTENDS and CONTRADICTS pick at most 8 candidate registry changes. Rate VALUE: HIGH =
   the registry is wrong, stale or silent on something a practitioner's decision depends on;
   MEDIUM = a useful dated fact or worked example that sharpens an existing rule; LOW = trivia
   or a vendor default that expires within weeks. A vendor default is LOW, a restatement is
   CONFIRMS. Say whether a maintainer would plausibly MERGE each, yes or no, and why.
4. VERIFY your top 5 candidates by opening their cited source URLs (WebFetch, read-only) and
   checking the claim text against the page. Mark VERIFIED / PARTLY / NOT-VERIFIED, quoting
   the page when it disagrees. An unverified candidate is not a lead.
5. Verdict, 4 sentences: how many MERGE-worthy candidates survived verification, how many are
   HIGH, and whether the research was worth its cost.

Write the report as markdown to `<REPORT>`. Reply in under 250 words: counts, one line per
candidate (value, merge yes/no, verified status), then the verdict.
