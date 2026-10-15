import { mkdtempSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import { defineConfig } from "@playwright/test";

import { installNetworkSeal } from "./tests/_seal";

// ==============================================================================
// THE NODE LANE — golden-path DYNAMIC verification probes.
//
// These are Node-context probes (no browser, no webServer) that import the
// repo's ACTUAL modules/components and assert BEHAVIOR, not pattern.
//
// ONE REAL CONFIG PER SUITE. The browser lane is `playwright.live.config.ts` and
// it is a separate file rather than a second `project` in this one, because a
// browser lane needs a `webServer` and `webServer` is config-wide: folding the
// two together would start a Next dev server every time somebody ran the fast
// probes. Membership is by LOCATION in both — `tests/golden-path/` here,
// `tests/live/` there — so a file in the wrong directory runs in the wrong lane
// and `git status` shows it.
// ==============================================================================

// SPEND STAYS IN MEMORY HERE. Off the managed posture every spend class defaults
// to this machine's ledger file (lib/spend/select.ts), and a probe that books $4
// must not leave $4 in foundry-out/spend/ for the next run, or the operator's
// server, to be refused against. Workers inherit it; only
// spend-ledger.probe.spec.ts opts into the file store, in temp directories.
// THE NETWORK SEAL. This module is loaded in the runner and in every worker, so installing the
// seal here covers every spec: loopback passes, any other host is refused (tests/_seal.ts;
// negative control tests/golden-path/network-seal.probe.spec.ts).
installNetworkSeal();

// "server-only" RESOLVES AS NEXT RESOLVES IT FOR SERVER CODE. Probes import route
// modules and app/_server directly, and those open with `import "server-only"`.
// Outside Next the package's default entry throws by design (it is not even
// installed standalone - Next vendors it), and Next's server compilers alias it
// to next/dist/compiled/server-only/empty (next/dist/build/create-compiler-
// aliases.js). Every probe in this lane is server code, so the lane takes the
// server's alias, once, here - beside the seal, loaded in the runner and in
// every worker. NOT a tsconfig `paths` entry: that would reach the client
// bundles too and disarm the guard where it is the whole point.
//
// Why Module._resolveFilename and not node:module's registerHooks: measured
// 2026-10-15 on Node 24.14, a .ts module reached by a probe's `await import()`
// is loaded by the ESM translator's CommonJS `require`, which calls
// Module._resolveFilename directly and consults neither registerHooks nor a
// register()ed loader. The property is the seam Playwright's own CJS transform
// hook patches (playwright/lib/transform/esmLoader.js installCJSHooks), and it
// covers require() and import() alike.
const SERVER_ONLY = path.join(process.cwd(), "node_modules", "next", "dist", "compiled", "server-only", "empty.js");
const resolveFilename: unknown = Reflect.get(Module, "_resolveFilename");
if (typeof resolveFilename !== "function") throw new Error("playwright.config.ts: Module._resolveFilename is gone; the server-only alias needs another seam");
Reflect.set(Module, "_resolveFilename", function (this: unknown, request: unknown, ...rest: unknown[]): unknown {
  return request === "server-only" ? SERVER_ONLY : Reflect.apply(resolveFilename, this, [request, ...rest]);
});

process.env.SPEND_STORE = "memory";

// THE GPU LEASE STAYS OFF THE REAL CARD'S DIRECTORY, for the same reason: the
// Ollama adapter takes a lease per recognition (lib/gpu/lease.ts), and a probe
// that ran while a real render held foundry-out/gpu/lease.json would be routed
// off the local eye by a tenant that is not part of the test. gpu-lease.probe
// points it at its own temp directories per case.
process.env.GPU_LEASE_DIR ??= mkdtempSync(path.join(tmpdir(), "gpu-lease-pw-"));

const NATIVE_ESM = [
  "**/imaging-auth.probe.spec.ts",
  "**/ledger-reconcile.probe.spec.ts",
  "**/principal.probe.spec.ts",
  "**/runs-live.probe.spec.ts",
  "**/server-seam.probe.spec.ts",
];

export default defineConfig({
  testDir: "./tests/golden-path",

  // SERIAL, WITH THE REASON ATTACHED — a stated property, not caution, so nobody
  // "optimises" it into parallel flake. These probes MUTATE `process.env`
  // (imaging-auth deletes NEXT_PUBLIC_DEV_AUTH, imaging-budget sets the ceiling,
  // firebase-absent-env empties the config) and they share one Node process. A
  // parallel run would let one probe's environment decide another probe's
  // verdict, and the loser would be whichever one happened to read first.
  //
  // The corollary: independence here comes from state reset inside each probe,
  // never from worker isolation, because there is no worker isolation.
  fullyParallel: false,

  // ONE `test.only` REDUCES THIS GATE TO ONE TEST, AND IT EXITS 0.
  //
  // Measured 2026-08-29: adding `.only` to a single case in
  // sort-stability.probe.spec.ts took `npm test` from 317 passed to "1 passed",
  // exit 0 — green in gates.yml, green in the pre-push hook, and the 316 probes
  // that guard money, auth, SSRF and the identity wipe did not run. Playwright's
  // default for `forbidOnly` is false, so nothing in the repo objected.
  //
  // That is precisely the failure this lane already has a probe about:
  // gate-vacuous-pass.probe.spec.ts opens with "a check that examined nothing
  // must not count as enforcement". The runner had the same hole as the code it
  // was written to guard.
  //
  // Gated rather than set outright, because `.only` is a legitimate local tool
  // while iterating. Two switches close it: CI (where gates.yml says the refusal
  // lives: "a check that runs only locally is a courtesy, not a gate") and
  // PW_FORBID_ONLY, which pipeline/run-gates.mts sets for every gate it spawns -
  // so the pre-push hook (`npm run verify`) refuses a committed `.only` too,
  // without CI=1 also changing what `next build` and eslint do. Held by
  // tests/golden-path/forbid-only-gate.probe.spec.ts.
  forbidOnly: !!process.env.CI || !!process.env.PW_FORBID_ONLY,

  reporter: [["list"]],
  // TWO PROJECTS, BECAUSE THE LANE LOADS @gt/* TWO WAYS. A v1 probe that `require()`s a route
  // module (deployment-cells' load()) pulls @gt/kernel through Playwright's CommonJS transform;
  // a probe that `await import()`s it gets Node's native ESM. In one worker the second loader
  // finds the first's copy and fails ("does not provide an export named 'err'", "exports is not
  // defined in ES module scope") - order-dependent, so it read as flakes for two phases. Workers
  // are never shared across projects, so the probes that import the new packages natively run
  // in their own. A new probe that `await import()`s @gt/*, lib/kernelStore, lib/ledger or
  // app/_server belongs in NATIVE_ESM.
  projects: [
    { name: "node", use: {}, testIgnore: NATIVE_ESM },
    { name: "node-esm", use: {}, testMatch: NATIVE_ESM },
  ],
});
