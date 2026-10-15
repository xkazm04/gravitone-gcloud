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
  },
});
