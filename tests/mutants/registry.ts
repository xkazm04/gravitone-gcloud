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
export const UNGUARDED_PROBE_BUDGET = 249;

export const MUTANTS: Mutant[] = [
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
    id: "gpu-recycle-any-caller",
    probe: "gpu-lease.probe.spec.ts",
    file: "lib/gpu/lease.ts",
    find: "if (!holder || holder.ticket !== lease.ticket)",
    replace: "if (false as boolean)",
    why: "Any tenant can recycle an engine another tenant is using: the Stop-Process the lease exists to stop.",
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
    id: "shelf-no-tiebreak",
    probe: "sort-stability.probe.spec.ts",
    file: "app/_projects/shelf.ts",
    find: "updated: (a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id),",
    replace: "updated: (a, b) => b.updatedAt - a.updatedAt,",
    why: "Two projects touched in the same millisecond swap places with the order the data arrived in.",
  },
  {
    id: "needs-you-no-tiebreak",
    probe: "sort-stability.probe.spec.ts",
    file: "app/_projects/shelf.ts",
    find: "    a.id.localeCompare(b.id)",
    replace: "    0",
    why: "The Rundown order stops being a total order; tied rows render in arrival order.",
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
    id: "research-clear-keeps-followups",
    probe: "step-clear-completeness.probe.spec.ts",
    file: "app/_phases/research/ResearchStep.tsx",
    find: "resetFollowUps(projectId);",
    replace: "void projectId;",
    why: "Clearing research leaves the old follow-up thread attached to the fresh run.",
  },
  {
    id: "recalibrate-drops-chain-breaks",
    probe: "chain-break-reaches-the-reviewer.probe.spec.ts",
    file: "app/_phases/script/recalibrate.ts",
    find: "(applied[r.id]?.chainBreaks ?? [])",
    replace: "([] as { renderId?: string }[])",
    why: "A cut that orphans a BUT is detected, then discarded before the reviewer can see it.",
  },
  {
    id: "spine-tail-first",
    probe: "spine-rank-total.probe.spec.ts",
    file: "app/_phases/script/trailer/types.ts",
    find: "tail: 4,",
    replace: "tail: -1,",
    why: "The tail movement is composed ahead of the cold open.",
  },
  {
    id: "spine-ordinal-ignored",
    probe: "spine-rank-total.probe.spec.ts",
    file: "app/_phases/script/trailer/cut.ts",
    find: "return ra !== rb ? ra - rb : a.ordinal - b.ordinal;",
    replace: "return ra - rb;",
    why: "Two movements of the same role keep arrival order instead of their own ordinal.",
  },
  {
    id: "alt-last-one-removable",
    probe: "alt-last-one-stays.probe.spec.ts",
    file: "app/_phases/frames/alternatives/alts.ts",
    find: "isSynthetic(frameId) || keptCount > 1;",
    replace: "isSynthetic(frameId) || keptCount > 0;",
    why: "The last kept alternative can be removed, leaving a frame with nothing to show.",
  },
  {
    id: "cancel-settled-job",
    probe: "cancel-settled-job.probe.spec.ts",
    file: "lib/jobs.tsx",
    find: 'j.id === jobId && j.status === "running"',
    replace: "j.id === jobId",
    why: "Cancelling a job that already finished rewrites its settled result as 'Stopped by you'.",
  },
  {
    id: "clear-any-job",
    probe: "bell-doors.probe.spec.ts",
    file: "lib/jobs.tsx",
    find: '!target || target.status !== "interrupted" || target.clearedAt != null',
    replace: "!target || target.clearedAt != null",
    why: "Clear works on running and finished jobs, not only interrupted ones.",
  },
  {
    id: "cull-failed-looks-ready",
    probe: "cull-non-ready.probe.spec.ts",
    file: "app/foundry/CullGrid.tsx",
    find: 'if (candidate?.status === "failed") return "failed";',
    replace: 'if (candidate?.status === "failed") return "ready";',
    why: "A failed candidate opens as a ready one, with Keep/Reject on a broken file.",
  },
  {
    id: "cull-deleted-looks-live",
    probe: "cull-non-ready.probe.spec.ts",
    file: "app/foundry/CullGrid.tsx",
    find: 'if (candidate?.deleted) return "deleted";',
    replace: 'if (candidate?.deleted) return "queued";',
    why: "A deleted candidate reappears in the grid as queued work.",
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
    id: "phase-heading-faded",
    probe: "run-trace-phase-rank.probe.spec.ts",
    file: "app/_phases/research/run/RunTrace.tsx",
    find: "tracking-[0.16em] text-white/60 uppercase first:mt-0",
    replace: "tracking-[0.16em] text-white/30 uppercase first:mt-0",
    why: "The research trace's phase headings fall back to near-invisible text and the reader loses the run's outline.",
  },
  {
    id: "job-noun-raw-kind",
    probe: "job-noun.probe.spec.ts",
    file: "lib/jobs.tsx",
    find: "return JOB_NOUN[kind];",
    replace: "return kind as string;",
    why: "The bell names a job by its raw internal id instead of a word the creator knows.",
  },
  {
    id: "kit-hash-law-lost",
    probe: "kit-hash.probe.spec.ts",
    file: "app/kit/catalog.ts",
    find: "h === \"identity\" || h === \"law\" ||",
    replace: "h === \"identity\" ||",
    why: "A shared #law link opens the kit on no module.",
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
    id: "energy-curve-unnamed",
    probe: "energy-curve-type-floor.probe.spec.ts",
    file: "app/_phases/script/trailer/EnergyCurve.tsx",
    find: "role=\"img\"",
    replace: "role=\"presentation\"",
    why: "The energy curve loses its accessible name and a screen reader skips the figure.",
  },
  {
    id: "unmeasured-check-reads-ok",
    probe: "checklist-unmeasured-loud.probe.spec.ts",
    file: "app/_phases/script/_parts/Meters.tsx",
    find: "label: \"not checked\"",
    replace: "label: \"ok\"",
    why: "A gate that never measured reads as passed.",
  },
  {
    id: "frame-count-on-explainer",
    probe: "frames-header-honesty.probe.spec.ts",
    file: "app/_phases/frames/FramesStep.tsx",
    find: "{!promotionalCut && <>{ctl.frames.length} frames derived from </>}",
    replace: "{true && <>{ctl.frames.length} frames derived from </>}",
    why: "A promotional cut claims a frame count for a frame layer it does not have.",
  },
  {
    id: "live-result-points-below",
    probe: "live-notebook-pointer.probe.spec.ts",
    file: "app/_phases/research/run/LiveResult.tsx",
    find: "<p className=\"font-jetbrains text-label text-white/35\">",
    replace: "<p className=\"font-jetbrains text-label text-white/35\">triage board below ",
    why: "The live result points at a board that is not below it.",
  },
  {
    id: "source-mojibake",
    probe: "source-encoding.probe.spec.ts",
    file: "app/kit/catalog.ts",
    find: "export function kitModuleForHash",
    replace: "// â€\nexport function kitModuleForHash",
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
    id: "mv-regenerate-reruns-everything",
    probe: "mv-queue.probe.spec.ts",
    file: "lib/sound/mv/queue.ts",
    find: "const redo = new Set((j.redo ?? []).flatMap((p) => REDO_STEPS[p]));",
    replace: "const redo = new Set((j.redo ?? []).flatMap(() => STEP_ORDER));",
    why: "Regenerate · metadata re-rolls the still and re-renders the video, spending a Leonardo image and minutes of render to change a title.",
  },
  {
    id: "mv-lease-ignores-live-holder",
    probe: "mv-queue.probe.spec.ts",
    file: "lib/sound/mv/queue.ts",
    find: "if (pid > 0 && alive(pid)) return `the music-video queue is being run by another process (pid ${pid})`;",
    replace: "if (pid > 0 && alive(pid) && pid < 0) return `the music-video queue is being run by another process (pid ${pid})`;",
    why: "An album batch and a dev server drain one store together: the second one's crash recovery requeues the job the first is rendering, and a still is bought twice.",
  },
  {
    id: "mv-focal-deaf-to-the-beat",
    probe: "mv-render.probe.spec.ts",
    file: "app/_phases/frames/music-video/compositor.ts",
    find: "const level = clamp01(breath + clamp01(f.pulseStrength) * (f.pulse[frameIndex] ?? 0));",
    replace: "const level = clamp01(breath);",
    why: "The music video's pulsing element only breathes on a timer and never answers the kick it was placed to pulse with.",
  },
];
