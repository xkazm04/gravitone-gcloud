// THE MUTANT REGISTRY - every entry names a defect a probe claims to guard, in a
// form a machine can seed and watch go red.
//
// The lane's own probe headers record probes that were GREEN WHILE THE DEFECT WAS
// ALIVE, and each time it was found by hand ("seed the defect and watch it fail
// to go red"). This file turns that ritual into data:
//
//   - `pipeline/probe-mutants.mts` (npm run test:mutants) applies each entry in a
//     scratch git worktree, runs the named probe, and demands a non-zero exit;
//   - `tests/golden-path/mutant-registry.probe.spec.ts` (inside `npm test`,
//     cheap) checks that every `find` still occurs EXACTLY ONCE, so a refactor
//     that moves the code turns the mutant STALE and loud, never silently skipped,
//     and ratchets the number of probes with no mutant at all.
//
// Entry rules:
//   - `find` occurs exactly once in `file` (verbatim, whitespace included);
//   - `replace` differs from `find` and must change BEHAVIOUR, not a comment - a
//     toothless mutant is reported `survived` by the runner;
//   - `probe` is a file name under tests/golden-path/;
//   - `why` is the counterfactual in a sentence: what breaks for a user.

export type Mutant = {
  id: string;
  /** Probe file under tests/golden-path/ that must go red. */
  probe: string;
  /** Repo-relative source file, forward slashes. */
  file: string;
  find: string;
  replace: string;
  why: string;
};

/**
 * PROBES WITH NO MUTANT. A ratchet: it may only FALL. A new `*.probe.spec.ts`
 * without an entry raises the live count above this number and
 * mutant-registry.probe.spec.ts refuses; an entry that guards a previously
 * unguarded probe lowers the live count and the same probe asks for this number
 * to be lowered to match, so the gain is kept.
 */
export const UNGUARDED_PROBE_BUDGET = 190;

export const MUTANTS: Mutant[] = [
  {
    id: "session-cross-origin-sets-cookie",
    probe: "server-seam.probe.spec.ts",
    file: "app/api/session/route.ts",
    find: "import { envelope, sameOrigin } from \"../../_server/http.ts\";",
    replace: "import { envelope } from \"../../_server/http.ts\"; const sameOrigin = (_r: Request): boolean => true;",
    why: "A cross-site page posts its own Firebase token to /api/session and the victim's browser is signed in as the attacker.",
  },
  {
    id: "network-seal-lets-real-hosts-through",
    probe: "network-seal.probe.spec.ts",
    file: "tests/_seal.ts",
    find: "if (u && !allowedUrl(u))",
    replace: "if (u && false)",
    why: "The node lane's seal stops refusing real hosts: a probe that reaches the internet by accident passes or fails on the network's state again, and every probe's verdict silently depends on it.",
  },
  {
    id: "landing-takes-the-signal-barrel",
    probe: "landing-isolation.probe.spec.ts",
    file: "app/_landing/parts.tsx",
    find: 'from "@/components/ui/signal/StaleBadge"',
    replace: 'from "@/components/ui/signal"',
    why: "The public landing imports StaleBadge through the barrel again, and the barrel's UpstreamBreak drags lib/projects and IndexedDB into a page with no signed-in work - the path Phase 0.3 cut.",
  },
  {
    id: "ad-overlay-fit-ignores-width",
    probe: "ad-overlay-fit.probe.spec.ts",
    file: "lib/adRender.ts",
    find: "(lines.length > maxLines || widest(lines, size_, weight) > width)",
    replace: "(lines.length > maxLines)",
    why: "An unbreakable URL, handle or compound word keeps the line COUNT in range, so the overlay never shrinks and the text runs past the safe zone on every platform reframe - the defect 7dc56b5 fixed.",
  },
  {
    id: "poll-freshness-failure-never-restores",
    probe: "poll-freshness.probe.spec.ts",
    file: "lib/pollFreshness.ts",
    find: "failAt <= okAt",
    replace: "false",
    why: "A poll edge that failed once stays flagged forever: every later successful read still shows the server-did-not-answer banner, so the operator stops trusting the one signal that says a status is stale.",
  },
  {
    id: "repair-no-shrink-guard-off",
    probe: "repair-turn.probe.spec.ts",
    file: "lib/text/repair.ts",
    find: "if (lost > 0)",
    replace: "if (lost > 9999)",
    why: "A repair turn can delete the facts that failed validation to make the validator pass, and the creator keeps a thinner notebook believing it was repaired.",
  },
  {
    id: "repair-unchanged-elsewhere-off",
    probe: "repair-turn.probe.spec.ts",
    file: "lib/text/repair.ts",
    find: "if (allowed.some((a) => covers(a, changed))) continue;",
    replace: "if (true) continue;",
    why: "A repair turn may rewrite fields it was never asked about, and the paid-for draft is silently changed outside the listed paths.",
  },
  {
    id: "gpu-busy-eye-not-reroutable",
    probe: "gpu-lease.probe.spec.ts",
    file: "lib/imaging/providers/ollama.ts",
    find: '"rate-limited",',
    replace: '"failed",',
    why: "A busy card fails the recognition outright instead of falling to the cloud eye.",
  },
  {
    id: "eviction-skip-upload-delete",
    probe: "identity-eviction-idb.probe.spec.ts",
    file: "lib/identityEviction.ts",
    find: "if (!dry) uploads.delete(uploadId);",
    replace: "if (!dry) void uploadId;",
    why: "Sign-out leaves the previous account's upload bytes on the shared machine, unreachable by any later wipe.",
  },
  {
    id: "recalibrate-drops-chain-breaks",
    probe: "chain-break-reaches-the-reviewer.probe.spec.ts",
    file: "lib/script/recalibrate.ts",
    find: "(applied[r.id]?.chainBreaks ?? [])",
    replace: "([] as { renderId?: string }[])",
    why: "A cut that orphans a BUT is detected, then discarded before the reviewer can see it.",
  },
  {
    id: "spine-tail-first",
    probe: "spine-rank-total.probe.spec.ts",
    file: "lib/script/trailer/types.ts",
    find: "tail: 4,",
    replace: "tail: -1,",
    why: "The tail movement is composed ahead of the cold open.",
  },
  {
    id: "spine-ordinal-ignored",
    probe: "spine-rank-total.probe.spec.ts",
    file: "lib/script/trailer/cut.ts",
    find: "return ra !== rb ? ra - rb : a.ordinal - b.ordinal;",
    replace: "return ra - rb;",
    why: "Two movements of the same role keep arrival order instead of their own ordinal.",
  },
  {
    id: "alt-last-one-removable",
    probe: "alt-last-one-stays.probe.spec.ts",
    file: "lib/frames/alternatives/alts.ts",
    find: "isSynthetic(frameId) || keptCount > 1;",
    replace: "isSynthetic(frameId) || keptCount > 0;",
    why: "The last kept alternative can be removed, leaving a frame with nothing to show.",
  },
  {
    id: "exit-drops-stderr-tail",
    probe: "cli-exit-classification.probe.spec.ts",
    file: "lib/claudeCli.ts",
    find: '`The local Claude process exited ${code}.${tail ? ` stderr: ${tail}` : ""}`',
    replace: "`The local Claude process exited ${code}.`",
    why: "The one line the engine wrote about why it failed reaches neither the log nor the route's answer.",
  },
  {
    id: "exit-login-not-detected",
    probe: "cli-exit-classification.probe.spec.ts",
    file: "lib/claudeCli.ts",
    find: "/login|auth|credential/i.test(stderr)",
    replace: "/zzz-never-matches/i.test(stderr)",
    why: "A logged-out CLI is reported as a generic crash instead of telling the creator to sign in.",
  },
  {
    id: "forbid-only-ignores-gate-switch",
    probe: "forbid-only-gate.probe.spec.ts",
    file: "playwright.config.ts",
    find: "forbidOnly: !!process.env.CI || !!process.env.PW_FORBID_ONLY,",
    replace: "forbidOnly: !!process.env.CI,",
    why: "A committed test.only reduces the pre-push gate to one test and exits 0.",
  },
  {
    id: "palette-keeps-zero-count-decisions",
    probe: "shell-palette.probe.spec.ts",
    file: "components/ui/shell/palette.ts",
    find: "if (n <= 0) continue;",
    replace: "if (n < 0) continue;",
    why: "The palette lists a Board source with nothing waiting as a destination worth a keystroke.",
  },
  {
    id: "ast-switchcase-wrong-label",
    probe: "_ast.probe.spec.ts",
    file: "tests/golden-path/_ast.ts",
    find: "ts.isStringLiteralLike(n.expression) && n.expression.text === label",
    replace: "ts.isStringLiteralLike(n.expression) && n.expression.text !== label",
    why: "A source probe asking for the Enter case is handed every other case, so a guard it demands is checked on the wrong branch.",
  },
  {
    id: "job-noun-raw-kind",
    probe: "job-noun.probe.spec.ts",
    file: "lib/jobs.tsx",
    find: "return NOUN[kind] ?? kind;",
    replace: "return kind;",
    why: "The bell names a job by its raw internal id instead of a word the creator knows.",
  },
  {
    id: "pip-hollow-too-faint",
    probe: "pip-contrast.probe.spec.ts",
    file: "components/ui/signal/PipRow.tsx",
    find: "hollow: \"border border-white/55\"",
    replace: "hollow: \"border border-white/12\"",
    why: "An empty slot pip disappears into the ink, so a row of slots reads as fewer than it is.",
  },
  {
    id: "bandtrack-bounds-too-faint",
    probe: "bandtrack-contrast.probe.spec.ts",
    file: "components/ui/signal/BandTrack.tsx",
    find: "text-label text-white/55",
    replace: "text-label text-white/20",
    why: "The min/max numbers under a band track fall below readable contrast.",
  },
  {
    id: "signed-out-chip",
    probe: "session-ended-reason.probe.spec.ts",
    file: "app/_landing/parts.tsx",
    find: "\"session-ended\": \"session ended\",",
    replace: "\"session-ended\": \"session ended\", \"signed-out\": \"signed out\",",
    why: "A deliberate sign-out is badged as a stale session, accusing the creator of a state they chose.",
  },
  {
    id: "upstream-here-name-faint",
    probe: "upstream-break-contrast.probe.spec.ts",
    file: "components/ui/signal/UpstreamBreak.tsx",
    find: "? \"text-white/85\"",
    replace: "? \"text-white/10\"",
    why: "The step you are on reads fainter than the ones not started, inverting the break's meaning.",
  },
  {
    id: "tally-key-opacity-low",
    probe: "chip-key-contrast.probe.spec.ts",
    file: "components/ui/signal/Tally.tsx",
    find: "\"uppercase opacity-80\"",
    replace: "\"uppercase opacity-20\"",
    why: "A Tally's key label drops below readable contrast.",
  },
  {
    id: "deck-hint-faint",
    probe: "deck-text-contrast.probe.spec.ts",
    file: "components/ui/deck/Deck.tsx",
    find: "\"font-jetbrains text-label text-white/60\"",
    replace: "\"font-jetbrains text-label text-white/35\"",
    why: "The Deck's hint text becomes the low-contrast grey the kit forbids.",
  },
  {
    id: "source-mojibake",
    probe: "source-encoding.probe.spec.ts",
    file: "app/(studio)/kit/sections.ts",
    find: "export type SectionId",
    replace: "// â€\nexport type SectionId",
    why: "A double-encoded character lands in a shipped source file.",
  },
  {
    id: "studio-prefer-only-off",
    probe: "imaging-studio.probe.spec.ts",
    file: "lib/imaging/router.ts",
    find: "if (steer.prefer && PREFER_ONLY.has(steer.prefer) && steer.prefer !== steer.avoid) return [steer.prefer];",
    replace: "if (steer.prefer && PREFER_ONLY.has(steer.prefer) && steer.prefer === steer.avoid) return [steer.prefer];",
    why: "A music-video still that asked for the Leonardo studio's prepaid credits is quietly rendered by another vendor billed in dollars.",
  },
  {
    id: "mv-focal-deaf-to-the-beat",
    probe: "mv-render.probe.spec.ts",
    file: "app/_phases/frames/music-video/compositor.ts",
    find: "const level = clamp01(breath + clamp01(f.pulseStrength) * (f.pulse[frameIndex] ?? 0));",
    replace: "const level = clamp01(breath);",
    why: "The music video's pulsing element only breathes on a timer and never answers the kick it was placed to pulse with.",
  },
  {
    id: "lib-imports-app-stepstore",
    probe: "no-app-imports.probe.spec.ts",
    file: "lib/identityEviction.ts",
    find: 'import { reportStorageTrouble } from "@/lib/steps";',
    replace: 'import { reportStorageTrouble } from "@/app/_phases/_shared/stepStore";',
    why: "A library module names app/ again: the CLI and library lanes can no longer load it outside Next, and the stub at the old path can turn the edge into a cycle that evaluates empty.",
  },
  {
    id: "shared-secret-cli-door-open",
    probe: "imaging-auth.probe.spec.ts",
    file: "lib/apiAuth.ts",
    find: "verdict === \"ok\" && (opts.use ?? \"money\") === \"money\" && sharedSecretCallers() === \"browser\" && !browserMarked(req)",
    replace: "verdict === \"ok\" && false",
    why: "Under SHARED_SECRET_CALLERS=browser a script still spends with the public bundle secret, so the operator's cutover to per-caller tokens retires nothing.",
  },
  {
    id: "cli-token-never-judged",
    probe: "imaging-auth.probe.spec.ts",
    file: "lib/apiAuth.ts",
    find: "  if (token !== undefined) return resolveCliToken(req, token, opts.use ?? \"money\", opts.now);",
    replace: "  if (token !== undefined && false) return resolveCliToken(req, token, opts.use ?? \"money\", opts.now);",
    why: "Every minted token is read as a wrong shared secret: no CLI can authenticate with the credential the operator gave it.",
  },
  {
    id: "cli-token-scope-unchecked",
    probe: "imaging-auth.probe.spec.ts",
    file: "lib/principal.ts",
    find: "  if (!scopeAdmits(t.scope, use)) return refuse(\"token-scope\");",
    replace: "",
    why: "A read-scope token is admitted on a money route, so the credential minted for a read-only skill spends vendor balance.",
  },
  {
    id: "cli-token-accepted-from-url",
    probe: "imaging-auth.probe.spec.ts",
    file: "lib/principal.ts",
    find: "  if (new URL(req.url).searchParams.get(\"k\") === token) return refuse(\"token-in-url\");",
    replace: "",
    why: "A month-long CLI token rides a `?k=` URL into access logs, browser history and Referer headers, and is honoured there.",
  },
  {
    id: "cli-token-shares-ip-bucket",
    probe: "principal.probe.spec.ts",
    file: "lib/principal.ts",
    find: "  if (r.kind === \"cli-token\") return r.uid;",
    replace: "",
    why: "A token's calls are bucketed by forwarded IP, which the caller writes: one looping script spreads past its limit, or starves every other caller behind one proxy.",
  },
  {
    id: "route-read-token-reads-as-unauthenticated",
    probe: "server-seam.probe.spec.ts",
    file: "app/_server/route.ts",
    find: "  if (r.status === 403) return { error: new AppError(\"refused\", r.detail, { detail: r.code }), headers: {} };",
    replace: "",
    why: "route() answers a read token on a money route with 401 unauthenticated, so the caller re-mints the same read token forever instead of asking for a money one.",
  },
  {
    id: "ledger-forge-drops-the-commit",
    probe: "ledger-reconcile.probe.spec.ts",
    file: "lib/ledger/v1/sources/forge.ts",
    find: "  if (run.committed !== undefined) {",
    replace: "  if (run.committed !== undefined && false) {",
    why: "The forge adapter stops projecting a run's commit: the Ledger never shows the act that deleted the rejected plates and wrote styles.json, while every count still looks plausible - only the reconcile against v1's own tally can see the missing fact.",
  },
  {
    id: "ledger-strips-drops-the-commit",
    probe: "ledger-reconcile.probe.spec.ts",
    file: "lib/ledger/v1/sources/strips.ts",
    find: "  if (run.status === \"committed\") out.push(",
    replace: "  if (run.status === \"committed\" && false) out.push(",
    why: "The strips adapter stops projecting a strip run's commit: the Ledger never shows the act that copied the keepers into git and deleted the rejected media, and nothing but the reconcile against v1's tally notices.",
  },
  {
    id: "ledger-articles-drops-the-landing",
    probe: "ledger-reconcile.probe.spec.ts",
    file: "lib/ledger/v1/sources/articles.ts",
    find: "  if (run.landedAt !== undefined) {",
    replace: "  if (run.landedAt !== undefined && false) {",
    why: "The articles adapter stops projecting `landedAt`: the Ledger never records that a post landed in the registry - the one article instant v1 writes once precisely so a reader need not trust `updatedAt`.",
  },
  {
    id: "ledger-suno-hides-the-interruption",
    probe: "ledger-reconcile.probe.spec.ts",
    file: "lib/ledger/v1/sources/suno.ts",
    find: "  if (why !== undefined) out.push(",
    replace: "  if (why !== undefined && false) out.push(",
    why: "The Suno adapter drops `queue.interrupted`: a crash that may have spent Suno credits on a create nobody collected leaves no trace in the Ledger, and the operator re-spends without checking the library.",
  },
  {
    id: "ledger-mv-drops-the-attempt-start",
    probe: "ledger-reconcile.probe.spec.ts",
    file: "lib/ledger/v1/sources/mv.ts",
    find: "    if (j.startedAt !== undefined) out.push(f.recorded(j.id, `start.",
    replace: "    if (j.startedAt !== undefined && false) out.push(f.recorded(j.id, `start.",
    why: "The MV adapter stops projecting each attempt's start: a retried video's first run, whose clocks retryMv erases from mv.json, is gone from the Ledger too.",
  },
  {
    id: "ledger-publish-forgets-a-reschedule",
    probe: "ledger-reconcile.probe.spec.ts",
    file: "lib/ledger/v1/sources/publish.ts",
    find: "    out.push(f.observed(slot.id, `at.${slot.publishAt}`",
    replace: "    if (Math.random() > 2) out.push(f.observed(slot.id, `at.${slot.publishAt}`",
    why: "The publish adapter stops observing `publishAt`: a slot moved to another day leaves no fact behind, and the Ledger cannot say when a post was planned to go out.",
  },
  {
    id: "ledger-turns-drops-the-end",
    probe: "ledger-reconcile.probe.spec.ts",
    file: "lib/ledger/v1/sources/turns.ts",
    find: "  if (rec.endedAt !== undefined) {",
    replace: "  if (rec.endedAt !== undefined && false) {",
    why: "The turns adapter stops projecting a turn's end: a failed or orphaned paid turn - with the error v1 kept verbatim - never reaches the Ledger, so the only record of why it died is a file that v1 never lists.",
  },
  {
    id: "ledger-spend-drops-the-counters",
    probe: "ledger-reconcile.probe.spec.ts",
    file: "lib/ledger/v1/sources/spend.ts",
    find: "  out.push(f.observed(c.cls, `counters.",
    replace: "  if (c.rows.length < 0) out.push(f.observed(c.cls, `counters.",
    why: "The spend adapter stops observing the meter's cumulative counters: once the hour's rows evict, the Ledger has no figure that reconciles with what the meter actually booked.",
  },
  {
    id: "ledger-gpu-drops-the-waits",
    probe: "ledger-reconcile.probe.spec.ts",
    file: "lib/ledger/v1/sources/gpu.ts",
    find: "  return lines.map((l) => {",
    replace: "  return lines.filter((l) => l.ev !== \"wait\").map((l) => {",
    why: "The GPU adapter skips the queue's `wait` lines: the Ledger shows who held the card but never who waited for it, so a tenant starved behind a long render is invisible.",
  },
  {
    id: "ledger-clips-drops-the-end",
    probe: "ledger-reconcile.probe.spec.ts",
    file: "lib/ledger/v1/sources/clips.ts",
    find: "  if (c.finishedAt !== null) {",
    replace: "  if (c.finishedAt !== null && false) {",
    why: "The clips adapter stops projecting a clip's end: a failed or refused video generation - with the vendor's words - never reaches the Ledger, though the vendor may already have charged for it.",
  },
  {
    id: "runs-model-hides-paused-work",
    probe: "runs-live.probe.spec.ts",
    file: "app/(studio)/projects/runs/_runs/model.ts",
    find: "  const live = input.live.jobs.map((j) => fromLive(j, now));",
    replace: "  const live = input.live.jobs.filter((j) => j.state !== \"paused\").map((j) => fromLive(j, now));",
    why: "Runs stops drawing paused v1 work: a Suno job held between steps (credits possibly spent) is on v1's queue page and nowhere on the day-line, so the operator who reads Runs as \"every live job\" never looks at it.",
  },
  {
    id: "bell-cleared-still-shown",
    probe: "bell-doors.probe.spec.ts",
    file: "lib/jobLinks.ts",
    find: "const interruptedJobs = jobs.filter((j) => j.status === \"interrupted\" && !j.clearedAt);",
    replace: "const interruptedJobs = jobs.filter((j) => j.status === \"interrupted\");",
    why: "A cleared interrupted job keeps its card and the bell keeps pulsing.",
  },
  {
    id: "mv-enqueue-not-idempotent",
    probe: "mv-queue.probe.spec.ts",
    file: "lib/sound/mv/queue.ts",
    find: "const live = f.jobs.find((j) => sameSource(j.source, s) && isLiveJob(j));",
    replace: "const live = f.jobs.find(() => false);",
    why: "A track already queued or rendering is queued again: a re-import doubles the queue and each copy buys its own still.",
  },
];
