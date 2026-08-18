import { defineConfig } from "@playwright/test";

// Config scoped to the golden-path DYNAMIC verification probes.
// These are Node-context probes (no browser, no webServer) that import the
// repo's ACTUAL modules/components and assert BEHAVIOR, not pattern.
export default defineConfig({
  testDir: "./tests/golden-path",
  fullyParallel: false,
  reporter: [["list"]],
  projects: [{ name: "node", use: {} }],
});
