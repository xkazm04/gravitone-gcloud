// The unit and integration rungs of the new version (docs/next/migration-plan.md §9).
// Membership is by location: every packages/*/test/**/*.test.ts and the governance-gate
// liveness tests under tests/next-gates. The Playwright lanes (tests/golden-path,
// tests/live) are separate configs and never collected here.
import { defineConfig } from "vitest/config";

export default defineConfig({
  // v1 modules import each other as `@/lib/...` (tsconfig paths); the v1 adapters under
  // app/_server/v1 read through them, so their tests resolve the same alias.
  resolve: { alias: [{ find: /^@\//, replacement: `${import.meta.dirname}/` }] },
  test: {
    include: ["packages/*/test/**/*.test.ts", "tests/next-gates/**/*.test.ts", "tests/next-server/**/*.test.ts"],
    exclude: ["**/node_modules/**", "tests/next-gates/fixtures/**"],
    environment: "node",
    passWithNoTests: false,
    // Half the cores off CI. At vitest's default (20 workers on the 20-core box) the files that spawn tsx CLIs and
    // Chromium starve each other: 2026-10-28 every full run failed, each time on a different timed case (5 s defaults,
    // a 60 s browser launch); at 10 workers two runs were green in 215 s against 186 s. CI keeps its default.
    ...(process.env["CI"] ? {} : { maxWorkers: "50%" }),
  },
});
