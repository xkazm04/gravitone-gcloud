# Almanac (v2 world) - design source

The owner chose this on 2026-09-29 from contest `landing-nextgen-brand-r2` (variant A/2). It is the
source of truth for the Almanac look that `components/kit` and `WORLD_ALMANAC` in
`components/ui/tokens.ts` implement. The kit overlay (`.claude/kit/config.md`) points here.

Files: `index.html` (door + brand sheet), `foundry.html` (working surface), `NOTES.md` (philosophy).

**Images are not committed.** The pages draw plates from the contest's data folder through an `IMG`
prefix; opened from here they render their layout and type without those images. The full arena
copy lives in the git-ignored `.contest/arena/landing-nextgen-brand-r2/` on the machine that ran it.

Status: the app's v2 kit is retired by `docs/next/migration-plan.md` (Phase 6). The landing keeps
its own world (Paper Cosmos), and a separate project decides the landing's future. This copy exists
so that decision has its source.
