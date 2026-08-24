# research overlay - gravitone-gcloud

Project specifics for the lane skill `/research`. The lane body (ingestion, scoring, phases, the
host-first rule, descoped-reopenable, the commit ritual) is generic; this file is what is true here.

## Product and stage

Gravitone Studio - a UI-first Next.js 16 / React 19 / Tailwind v4 prototype of a content-production
studio (five phases + an asset library) running entirely on mocked fixtures in `app/_studio/`.

**The stage matters for triage.** There is no backend, no auth and no third-party service here yet,
and that is deliberate. A source's idea about model providers, pipelines, queues or hosting is not out
of scope - it lands as a **Reference** (a decision to make when the backend is designed), not as code
to write today. Ideas about the *interface* to that future backend - what a surface must be able to
show, what a fixture must be able to say - are the highest-value findings this skill can produce,
because they are cheap now and expensive later.

## Vault

`C:/Users/mkdol/dolla/gravitone-gcloud/.vault` (in-repo, gitignored, Obsidian-openable). Create it on
first run; do not commit it. `Lessons/`, `Patterns/` and `active-runs.md` are shared with the other
adopted skills.

## Buckets (this repo's set)

| bucket | what it is | where it lands |
|---|---|---|
| **A - Code** | a change to existing code that fits in this session | the repo, committed |
| **B - Direction** | too big for one session; feeds `/perfect` | `.vault/Perfect/directions/<slug>.md`, `status: proposed` |
| **C - Reference** | a tool/model/API/service worth knowing when the backend is designed | `.vault/Reference/<slug>.md` |
| **D - Craft** | durable know-how about how the *content* is made | `knowledge/` (versioned, committed) |

Bucket C exists because this repo deliberately has no backend. Record what it is, what it would
replace or enable, what it costs (money, latency, lock-in), the *decision* it informs, and a
reconsider trigger. **Never install a dependency or wire a service off a Reference finding.**

Bucket B: first scan `.vault/Perfect/directions/` for the same idea *by meaning, not by slug* - an
idea the user rejected once must be presented as a re-open with the recorded reason, or dropped. Name
the `context-map.json` context it belongs to; a direction spanning more than two contexts is usually
two directions. Never seed that folder without explicit user acceptance - it is `/perfect`'s queue.

## Craft mode (bucket D) - the grounding engine

Use `craft` when the source is exemplar *work* rather than commentary. When the user names a template
step ("script step", "how do we do frames"), assume `craft`.

**Composition first, metrics last.** The beat chain is the finding; delivery rates are an appendix. A
craft run whose headline output is a table of rates has failed regardless of how accurate the table is.

Ingestion, in this order:

1. Pull **both** subtitle tracks and the metadata - manual/edited captions are punctuated and support
   sentence-level analysis, ASR captions are not, and which you got constrains what you may claim.
   ```bash
   yt-dlp --skip-download --write-auto-sub --write-sub --sub-lang "en.*" --sub-format vtt \
     -o "%(uploader)s--%(id)s.%(ext)s" "<url>"
   yt-dlp --skip-download --print "%(uploader)s | %(title)s | %(duration)ss | %(upload_date)s | views=%(view_count)s" "<url>"
   ```
2. **De-overlap at WORD level.** YouTube rolling captions repeat each cue's tail at the next cue's
   head; a line-level dedupe leaves ~2x the real word count. Use
   `knowledge/templates/<template>/steps/<nn>-<step>/corpus/parse_vtt.py`. **Sanity-check wpm before
   trusting anything** - over ~280 wpm means the de-overlap failed, not that the narrator is fast.
3. **Read the whole thing**, not sampled; long sources in ~90-second windows.
4. **Map the beat chain** - per beat: timestamp, one-line claim, and the connector to the previous
   beat (`BUT` / `THEREFORE` / `AND THEN`). Mark the questions asked aloud, the turns, the analogies,
   the scale conversions, the hook's shape, where the thesis is actually stated, and the close.
5. **Name the engine** against `knowledge/ENGINES.md`; a new one is a headline result. Separate the
   skeleton from the execution - say plainly why an execution should not be copied.
6. **Now measure** with `corpus/metrics.py <file>=<duration_s>`, interpreting every figure as a
   consequence of the engine, never as an independent dial.
7. **Commit the corpus** into the step's `corpus/` folder.

Library rules that keep it from rotting: composition first; `n=` always visible next to a claim;
quote rather than paraphrase into authority; measure what is measurable and record the rest as
unknown. Write in this order - `sources/<slug>.md` teardown, `corpus/`, `PATTERNS.md` (in place),
`params.json`, `OPEN-QUESTIONS.md`. **A craft run that produces no OPEN-QUESTIONS entries did not look
hard enough.** A source far longer than the template's target is fully usable for technique - say so
in the teardown's first line and mark compressed timings INFERRED.

## Reference files

- `context-map.json` (repo root) - always loaded; the relevance-scoring surface. **A Personas app
  export** (project `gravitone`, id `91d8170c-...`), export-only, never hand-edited: the next scan
  overwrites it from the DB. 4 groups / 4 contexts / 28 files; the `keywords` arrays score better than
  the prose. Five files are unmapped as a known baseline (`README.md`, `AGENTS.md`, `CLAUDE.md`,
  `package.json`, `tsconfig.json`). If it is missing, stop and ask for a scan - never write one.
- `README.md` - always loaded; the product, the mocked seam, the design language's rules.
- `components/ui/tokens.ts` - load whenever a finding touches visuals; the only file allowed a colour
  literal.
- `app/_studio/types.ts` + `projectTypes.ts` - load whenever a finding touches what the product knows.
- `knowledge/CRAFT-BASELINE.md`, `knowledge/ENGINES.md`, `knowledge/TONE.md`, `knowledge/README.md` -
  read before any craft run.
- `.vault/Perfect/directions/` - read before presenting a Direction finding.
- The parent project `../arm/gravitone/web` (and its `DESIGN.md`) - consult for "has this already been
  solved here?", never edit from this repo.

## Triage traps specific to this repo

- **Fixture vs product.** Before scoring any finding that criticises what the studio "does" - render
  time, take count, cost, failure rate - check whether the number comes from fixture data in
  `app/_studio/` or from product logic. Almost always the former, which makes it "the mock is
  unrealistic", not an architecture finding. If a finding's premise is "the app computes X badly" and
  X is a literal in a fixture file, the finding is wrong as framed.
- **Now vs when-the-backend-lands.** "Could this ship today with no new dependency and no new
  service?" If no -> Reference, not code.
- **Design impact.** A code finding touching `app/**/*.tsx` or `components/**/*.tsx` states whether it
  needs a colour, motion or type treatment the design system does not have - `design: needs a new
  token`, and name it.

## Gates

- Any change -> `npx tsc --noEmit`
- Routing / layout / server-rendered change -> `npm run build`
- A visibly rendered change -> drive it: `npm run dev -p 3177` (**never 3000**), look, then say what
  you saw. Kill the server you started; never kill one you did not start.
- **There is no linter and no test suite.** Do not run or claim `npm run lint` / `npm test`.

## Commit scope

Stage: the vault is at `.vault/` **inside** this repo but gitignored, so it must NOT appear in git
status - if it does, the ignore rule is missing; fix that rather than committing the vault. Do stage
`knowledge/**` on a craft run (the library IS the deliverable and is versioned) and `README.md` when
Phase 10e updated it. Never stage `context-map.json` as a hand edit - it is an export.

## Retired phases

The engine's release-log phase has no referent here (no release log, no `releases.json`, no locale
files). If a changelog is ever added, re-add a phase that writes it - do not repurpose the Research
note for it.

## Open questions for future runs

- Does the Code / Direction / Reference bucketing hold, or does "Direction" swallow everything while
  the product is still a prototype? Revisit after 3 runs.
- Is `context-map.json` (4 broad contexts) a fine enough scoring surface? If it keeps hurting, the fix
  is a Context Ledger split + pin in the Personas app, not a private map.
