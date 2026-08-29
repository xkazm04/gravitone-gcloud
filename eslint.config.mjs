// ESLint flat config — the repo's first lint rung.
//
// Base: `eslint-config-next/core-web-vitals` (the Next.js recommended set plus the
// Core Web Vitals rules) and `eslint-config-next/typescript`. Both are peers of the
// `next` version this repo resolves, so the rule content moves only when a
// dependency in this repo moves — the input is deterministic given the tree.
//
// THE VERSION IS NOT RESTATED HERE, and that is the point. It used to say
// `next@16.3.0`; package.json now asks for 16.3.3 and `eslint-config-next` is a
// caret RANGE, so a number written into a comment was wrong within one bump and
// disagreed with .github/workflows/gates.yml, which had been updated. The
// authority is package-lock.json — it is what `npm ci` installs, and it is what
// makes "deterministic given the commit" true. Read the version there.
//
// Everything below the base is a deliberate, commented decision. Two kinds appear:
//   (a) rules turned ON because this codebase already holds the convention by hand
//       and nothing was checking it;
//   (b) rules turned OFF/downgraded because the convention they encode is not this
//       repo's, and enforcing it would manufacture noise rather than find defects.
// Nothing here is disabled because it was merely inconvenient to fix; every
// suppression names the reason.

import next from "eslint-config-next";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  {
    // Not source. Build output, dependencies, generated artifacts and the
    // `gauntlet/` tree that tsconfig already excludes from typecheck — linting
    // them would grade code this repo does not author.
    ignores: [
      "node_modules/**",
      // AGENT TOOLING, AND — THE REASON THIS ENTRY EXISTS — AGENT WORKTREES.
      //
      // `.claude/worktrees/<name>/` holds a git worktree: a SECOND FULL CHECKOUT
      // of this repository, `lib/` and `app/` and all. ESLint walks by path, not
      // by git index, so with this line absent it graded both copies and every
      // warning bucket came out at exactly twice its real size — measured
      // 2026-08-29: 608 files walked, 309 of them under `.claude/`, and
      // set-state-in-effect 14 -> 28, refs 3 -> 6, immutability 1 -> 2,
      // exhaustive-deps 1 -> 2, each the true number doubled.
      //
      // The ratchet did its job and went red. What it could NOT say is that the
      // rise was a second copy of the same debt rather than new debt, so the
      // gate read as "you added fourteen hook violations" and pointed at a
      // refactor nobody needed to do. A tree that is not this checkout is not
      // this checkout's debt.
      ".claude/**",
      ".next/**",
      ".next-*/**",
      "out/**",
      "build/**",
      "coverage/**",
      "test-results/**",
      "gauntlet/**",
      "imaging-probe-out/**",
      "frames-direction-out/**",
      "public/**",
      "next-env.d.ts",
      "**/*.tsbuildinfo",
    ],
  },

  ...next,
  ...nextCoreWebVitals,
  ...nextTypescript,

  {
    rules: {
      // --- (a) conventions this repo already holds, now checked -------------

      // The repo's error handling is built on closed unions and outcome values;
      // `stepStore.ts:14-29` records that a swallowed `catch {}` WAS the bug.
      // An empty block is exactly the shape of that defect.
      "no-empty": ["error", { allowEmptyCatch: false }],

      // `lib/imaging/` is a governed chokepoint; a stray `debugger` or a
      // re-declared binding in it is a real defect, not style.
      "no-debugger": "error",
      "no-var": "error",
      "prefer-const": "error",

      // --- (b) conventions that are NOT this repo's -------------------------

      // `console` IS a designed output channel here: `lib/imaging/log.ts` emits
      // the structured server-side call log through it, and the pipeline/*.mts
      // drivers are console programs. Warning on it would flag the intended
      // design in 100+ places.
      "no-console": "off",

      // The unused-vars rule ships as an error in the TypeScript preset and is
      // kept, but with the underscore escape the codebase already uses for
      // deliberately-ignored bindings (destructured rest, catch params).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },

  {
    // The Node-side probe harness and the pipeline drivers are scripts, not app
    // code: they run under tsx/node, use `process`, and are never bundled for the
    // browser. React/Next rules do not apply to them.
    files: ["pipeline/**/*.{mts,mjs,ts}", "tests/**/*.ts", "playwright.config.ts"],
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "@next/next/no-img-element": "off",
    },
  },

  {
    // --- DEBT-SHAPED ADVISORY, with an expiry ------------------------------
    //
    // `eslint-plugin-react-hooks@7` ships the React Compiler's own analyses at
    // BLOCKING severity. Their input is fully deterministic given this tree — the
    // rule set is pinned by `eslint-config-next` at the version package-lock.json
    // resolves, so the same commit re-linted next month gives the same verdict.
    // What fails is the *current
    // state of the tree*, not the check. Per the registry's
    // `quality-gates/blocking-by-input-determinism`, that is the debt-shaped kind
    // of advisory: it carries an expiry by construction, and it is NOT permitted
    // to sit here on inertia.
    //
    // The findings are real. Every one of them is a load-first hook that calls
    // `setState(null)` in an effect body before kicking off an async reload
    // (`useProjects`, `useThemes`, `useAssets`, `useAuth`, `useScope`,
    // `useVersions`, …). Fixing them is a genuine refactor of the studio's data
    // loading, not a lint sweep, and shipping it inside the commit that first
    // installs the linter would be the worst possible bundling.
    //
    // So they are warnings, and the population is FROZEN by a ratchet:
    // `pipeline/lint-ratchet.mjs` compares the per-rule warning counts against the
    // committed `lint-baseline.json` and refuses ANY mismatch, in either
    // direction. The debt cannot grow, and it cannot shrink unattributed.
    //
    // PROMOTION TRIGGER (falsifiable): when a bucket below reaches 0 in
    // `lint-baseline.json`, delete its entry there AND its entry here, so the rule
    // stands at the plain blocking severity the preset gives it.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
    },
  },
];

export default config;
