# The Watershed - the approved design reference

The pages in `app/` are the design the rebuild targets. They come from contest
`foundry-next-design-r4`, winner A/1 "The Watershed", after the owner-gated polish waves. Approval
was recorded 2026-10-14 (`docs/next/migration-plan.md`).

- **Open:** `app/index.html` (the Floor). The other pages are `app/projects.html` (Plan · Runs ·
  Compose), `app/library.html`, `app/ledger.html` and `app/kit.html`.
- **Data:** the pages load `../data/`. That folder is git-ignored (20 MB); rebuild it with
  `node docs/next/prototype/tools/rebuild-data.mts` (needs `foundry-out/`, Python with Pillow,
  and the ai-registry checkout).
- **What it is for:**
  - It is the **fidelity** reference. A cutover holds the style contract against these pages at
    0 deviations on the owner's named roles (`docs/next/migration-plan.md` §9.6).
  - It is not code to copy. Its JavaScript is prototype code: string-built HTML, duplicated
    helpers, globals. The rebuild extracts the design from it and leaves the code behind (§9.1;
    contest skill `references/port-quality.md`).
- **Do not edit `app/`.** A design change goes through the owner and is recorded as a new design
  decision, not as a quiet edit of the reference.
