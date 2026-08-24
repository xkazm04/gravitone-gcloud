"use client";

// THE CONTROL SURFACE — the designed door the live-app harness drives through.
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO GUARDS, AND THE FIRST ONE IS A BUILD-TIME SWITCH, NOT A RUNTIME FLAG.
//
//   1. `process.env.NODE_ENV === "production"` — Next sets this for `next build`,
//      and webpack inlines the literal, so in a production bundle the first line
//      of the effect reads `if (true) return;` and EVERYTHING BELOW IT IS
//      UNREACHABLE. The minifier drops the body, and with it every string in it,
//      including the `window` key. That is why this whole implementation lives
//      inside ONE function rather than being imported from a module: dead-code
//      elimination inside a single function body is something the minifier does
//      reliably, and cross-module elimination of an exported function is
//      something it does not. NOTES.md (2026-08-12) measured that exact
//      distinction on lib/devAuth.ts — the behaviour was gated but the exported
//      const still shipped as dead data. This file is shaped so nothing ships.
//
//      MEASURED BOTH WAYS, 2026-08-24, on a real `npm run build`. As written:
//      0 of 21 browser chunks contain `__gravitoneHarness` or the banner below,
//      while `dev-automation-user` is still in 1 — so the shape is doing the
//      work, not the wish. Rewritten to `if (!DEV_AUTH) return;` with DEV_AUTH
//      imported from lib/devAuth: BOTH strings appear in a browser chunk and
//      `npm run check:bundle` fails. The warning above is not theoretical; it is
//      the counterfactual that was run.
//
//   2. `process.env.NEXT_PUBLIC_DEV_AUTH === "1"` — the same explicit opt-in the
//      auth bypass takes, so an ordinary `next dev` session has no control
//      surface either.
//
// The two conditions are DEV_AUTH's two conditions (lib/devAuth.ts), written
// inline here for the reason above. `tests/golden-path/harness-gate.probe.spec.ts`
// holds this file's guards against that module's, so the copy cannot drift, and
// `pipeline/check-bundle.mjs` reads the emitted production chunks for the
// fingerprints below and fails if either survives.
//
// WHAT THIS IS NOT. It is not a way to reach the product without signing in —
// that is lib/devAuth.ts, which predates it and is gated identically. This adds
// no authority; it adds a way to RESET and to READ BACK, which a browser-driven
// journey cannot do through the UI without asserting on its own side effects.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";

import { useAuth } from "@/lib/useAuth";
import { useJobs } from "@/lib/jobs";
import { evictIdentity } from "@/lib/identityEviction";
import { listProjects, projectContents } from "@/lib/projects";
import { listThemes } from "@/lib/themes";
import type {
  AccountSnapshot,
  HarnessControl,
  ProjectReadback,
  ResetOutcome,
} from "@/lib/harness/protocol";

export default function HarnessBridge() {
  const { user } = useAuth();
  const { jobs } = useJobs();

  useEffect(() => {
    // GUARD 1 — build-time. Folds to `if (true) return;` in a production bundle;
    // every line below is then unreachable and is dropped.
    if (process.env.NODE_ENV === "production") return;
    // GUARD 2 — explicit opt-in, the same one the auth bypass takes.
    if (process.env.NEXT_PUBLIC_DEV_AUTH !== "1") return;
    if (typeof window === "undefined") return;

    const uid = user?.uid ?? null;

    const control: HarnessControl = {
      protocol: 1,

      async snapshot(): Promise<AccountSnapshot> {
        // A null uid is reported, never papered over: the harness must wait for
        // the gate rather than assert against an account that does not exist yet.
        const rows = uid ? await listProjects(uid) : [];
        const themes = uid ? await listThemes(uid) : [];
        return {
          protocol: 1,
          uid,
          projects: rows.map((p) => ({
            id: p.id,
            title: p.title,
            phase: p.phase,
            progress: p.progress,
          })),
          themes: themes.length,
          jobs: {
            running: jobs.filter((j) => j.status === "running").length,
            total: jobs.length,
          },
        };
      },

      async project(projectId: string): Promise<ProjectReadback> {
        // `projectContents` is the product's own answer to "what has this
        // project written" — the same call `deleteProject` uses to report what
        // it removed. Reusing it means this readback cannot drift from the
        // product's idea of a project's body of work.
        const contents = await projectContents(projectId);
        const rows = uid ? await listProjects(uid) : [];
        return {
          id: projectId,
          found: rows.some((p) => p.id === projectId),
          steps: contents.steps,
          phases: contents.phases.slice(),
        };
      },

      async reset(): Promise<ResetOutcome> {
        if (!uid) {
          return {
            uid: "",
            projects: 0,
            steps: 0,
            themes: 0,
            assets: 0,
            local: 0,
            failed: true,
          };
        }
        // The product's own one-owner wipe: four stores in ONE transaction plus
        // the seeded flags and the job tray. "signed-out" is the honest reason —
        // the account is being put back to the state a fresh sign-in finds.
        const report = await evictIdentity(uid, "signed-out");
        return {
          uid: report.uid,
          projects: report.projects,
          steps: report.steps,
          themes: report.themes,
          assets: report.assets,
          local: report.local,
          failed: report.failed,
        };
      },
    };

    window.__gravitoneHarness = control;
    // The banner is the fingerprint check-bundle hunts, and it is also the one
    // line in the console that tells a developer who opened dev tools why there
    // is an object on `window`.
    console.info("[harness] gravitone control surface installed — protocol 1");

    return () => {
      delete window.__gravitoneHarness;
    };
    // Re-installed when the account or the job list changes, because both are
    // captured by value above: a control surface holding last render's uid would
    // read the previous account's shelf and report it as this one's.
  }, [user, jobs]);

  return null;
}
