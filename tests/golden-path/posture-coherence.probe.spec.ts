// PROBE — POSTURE COHERENCE: a capability is the server's whole answer.
//
// Closes the three findings the deployment-cell lane recorded on its first run
// (CIP-B, 2026-10-06) and pins the rules that closed them:
//   (a) GET /api/publish/channels probed PATH for ffmpeg/ffprobe through a
//       shell whatever the posture. Where spawning is forbidden, readiness now
//       answers `forbidden` from the posture and starts no process.
//   (b) cut/export (403), music-video/export (503) and ads/render (503)
//       refused local-binaries-forbidden behind no capability. `localRender`
//       (a function of the posture, not a flag) covers all three, and all
//       three refuse with ONE status: 503.
//   (c) a fresh clone showed the music capabilities with no key. A capability
//       backed by a fact (CAPABILITY_FACT) is off when the fact is: a flag can
//       turn a configured one off and never an unconfigured one on.
// And the seam that makes the browser honest: no client file computes the
// matrix itself — it asks the server through useCapabilities().
//
// No network, no process: spawnSync is replaced for the channel cases.
//
// Phase 6 wave C (L70): the three refusing routes (cut/export, music-video/export,
// ads/render) and GET /api/capabilities retired with the v1 pages. What stays
// pinned: localRender is a function of the posture, CAPABILITY_ROUTES still names
// every route that refuses local-binaries-forbidden (none now - a new one must be
// covered), the server's facts and matrix, and no file computes the matrix itself.

import childProcess from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { ACCESS_SECRET_VAR } from "@/lib/apiAuth";
import {
  absenceReason,
  ABSENCE_REASON,
  capabilities,
  CAPABILITY_FACT,
  CAPABILITY_ROUTES,
  FACT_ABSENT,
  PENDING_FACTS,
  soundStoreListed,
  type DeploymentFacts,
} from "@/lib/capabilities";
import { MANAGED_MARKERS } from "@/lib/deployment";
import { MUSIC_KEY_VAR } from "@/lib/music/elevenlabs";
import { PRINCIPAL_MODE_VAR } from "@/lib/principal";
import { deploymentFacts, serverCapabilities } from "@/lib/serverCapabilities";

import { keepEnv, stripComments } from "./_helpers";

const ROOT = process.cwd();
const MUSIC_FLAGS = ["NEXT_PUBLIC_CAP_MUSIC_GENERATE", "NEXT_PUBLIC_CAP_MUSIC_SECTION_EDIT", "NEXT_PUBLIC_CAP_MUSIC_SFX"];
keepEnv([
  MUSIC_KEY_VAR,
  "LOCAL_BINARIES",
  ...MANAGED_MARKERS,
  ...MUSIC_FLAGS,
  ACCESS_SECRET_VAR,
  "NEXT_PUBLIC_DEV_AUTH",
  "NEXT_PUBLIC_LOCAL_MODE",
  PRINCIPAL_MODE_VAR,
]);

/** A clean laptop: no marker, no override, no key, no flag. */
function laptop() {
  for (const m of MANAGED_MARKERS) delete process.env[m];
  for (const f of MUSIC_FLAGS) delete process.env[f];
  delete process.env.LOCAL_BINARIES;
  delete process.env[MUSIC_KEY_VAR];
}

const ALL: DeploymentFacts = { musicKey: true, localBinaries: true };

/* ── (c) the composition rule ────────────────────────────────────────────── */

test("capabilities(): a fact-backed capability is on only when its flag allows it AND its fact holds", () => {
  laptop();
  const facts = Object.keys(ALL) as (keyof DeploymentFacts)[];
  expect(Object.keys(CAPABILITY_FACT).length, "no capability is fact-backed - the rule below judges nothing").toBeGreaterThanOrEqual(4);
  for (const [cap, fact] of Object.entries(CAPABILITY_FACT) as [keyof ReturnType<typeof capabilities>, keyof DeploymentFacts][]) {
    expect(facts).toContain(fact);
    expect(capabilities(ALL)[cap], `${cap} with every fact present and no flag`).toBe(true);
    expect(capabilities({ ...ALL, [fact]: false })[cap], `${cap} with ${fact} missing`).toBe(false);
    expect(capabilities(PENDING_FACTS)[cap], `${cap} before the server answered`).toBe(false);
  }
  // A capability with no fact does not move with the facts.
  for (const cap of Object.keys(capabilities(ALL)) as (keyof ReturnType<typeof capabilities>)[])
    if (!(cap in CAPABILITY_FACT)) expect(capabilities(PENDING_FACTS)[cap], `${cap} has no fact and still moved`).toBe(capabilities(ALL)[cap]);
});

test("capabilities(): an explicit flag turns a configured music capability off, and can never turn an unconfigured one on", () => {
  laptop();
  for (const v of ["1", "true", "on"]) {
    for (const f of MUSIC_FLAGS) process.env[f] = v;
    const c = capabilities({ ...ALL, musicKey: false });
    expect([c.musicGenerate, c.musicSectionEdit, c.musicSfx], `flags=${v}, no key`).toEqual([false, false, false]);
  }
  for (const f of MUSIC_FLAGS) process.env[f] = "0";
  const off = capabilities(ALL);
  expect([off.musicGenerate, off.musicSectionEdit, off.musicSfx], "flags=0, key present").toEqual([false, false, false]);
});

test("serverCapabilities(): reads the key and the posture from their owners - fresh clone, keyed laptop, managed, rehearsal, override", () => {
  laptop();
  let c = serverCapabilities();
  expect({ m: c.musicGenerate, e: c.musicSectionEdit, s: c.musicSfx, r: c.localRender }, "fresh clone").toEqual({ m: false, e: false, s: false, r: true });
  expect(deploymentFacts()).toEqual({ musicKey: false, localBinaries: true });

  process.env[MUSIC_KEY_VAR] = "probe-key";
  c = serverCapabilities();
  expect([c.musicGenerate, c.musicSectionEdit, c.musicSfx, c.localRender], "keyed laptop").toEqual([true, true, true, true]);
  process.env[MUSIC_KEY_VAR] = "   ";
  expect(serverCapabilities().musicGenerate, "a blank key is no key").toBe(false);

  process.env.K_SERVICE = "gravitone";
  expect(serverCapabilities().localRender, "Cloud Run").toBe(false);
  process.env.LOCAL_BINARIES = "on";
  expect(serverCapabilities().localRender, "LOCAL_BINARIES=on overrides the marker").toBe(true);
  delete process.env.K_SERVICE;
  process.env.LOCAL_BINARIES = "off";
  expect(serverCapabilities().localRender, "LOCAL_BINARIES=off on a laptop").toBe(false);
});

test("keyless cell: spending section edits is off, and takes already stored are still listed - reading needs no key", () => {
  laptop();
  const c = serverCapabilities();
  expect([c.musicSectionEdit, c.musicGenerate], "the spend is off with no key").toEqual([false, false]);
  expect(soundStoreListed(), "the storeBacked decision on a keyless box").toBe(true);
  process.env[MUSIC_KEY_VAR] = "probe-key";
  expect([serverCapabilities().musicSectionEdit, soundStoreListed()], "keyed").toEqual([true, true]);
  // The operator's flag is the one thing that removes the store.
  delete process.env[MUSIC_KEY_VAR];
  process.env.NEXT_PUBLIC_CAP_MUSIC_SECTION_EDIT = "0";
  expect(soundStoreListed(), "flag off, no store").toBe(false);
  // The three v1 surfaces that LISTED takes from it (ScoreSpotting, AdsScore, useCut) retired with
  // the studio (Phase 4 wave D); the score part reads its takes from the kernel's part records.
});

test("absenceReason(): names the missing fact when that is the cause, the flag's reason otherwise; fact sentences fit a Hint", () => {
  laptop();
  for (const [fact, s] of Object.entries(FACT_ABSENT))
    expect(s.trim().split(/\s+/).length, `FACT_ABSENT.${fact} runs past twelve words`).toBeLessThanOrEqual(12);
  expect(absenceReason("musicGenerate", { ...ALL, musicKey: false })).toBe(FACT_ABSENT.musicKey);
  expect(absenceReason("localRender", { ...ALL, localBinaries: false })).toBe(FACT_ABSENT.localBinaries);
  expect(absenceReason("musicGenerate", ALL), "key present, so the flag is the cause").toBe(ABSENCE_REASON.musicGenerate);
  expect(absenceReason("publish", PENDING_FACTS), "no fact backs publish").toBe(ABSENCE_REASON.publish);
});

/* ── (b) one status, one code, one capability ─────────────────────────────── */

test("localRender covers exactly the routes that refuse local-binaries-forbidden, and is off in both forbidding postures", () => {
  // DERIVED: every route whose source refuses with the code, comment-stripped.
  const routes: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === "route.ts") routes.push(path.relative(ROOT, full).split(path.sep).join("/"));
    }
  };
  walk(path.join(ROOT, "app", "api"));
  expect(routes.length, "the route walk read nothing").toBeGreaterThan(0);
  const refusing = routes.filter((r) => /["']local-binaries-forbidden["']/.test(stripComments(readFileSync(path.join(ROOT, r), "utf8"))));
  expect([...refusing].sort(), "a route refuses local-binaries-forbidden and localRender does not cover it").toEqual([...CAPABILITY_ROUTES.localRender].sort());
  for (const rel of CAPABILITY_ROUTES.localRender) expect(existsSync(path.join(ROOT, rel)), `CAPABILITY_ROUTES names a route that is gone: ${rel}`).toBe(true);

  for (const posture of [{ LOCAL_BINARIES: "off" }, { K_SERVICE: "gravitone" }]) {
    laptop();
    Object.assign(process.env, posture);
    expect(serverCapabilities().localRender, JSON.stringify(posture)).toBe(false);
  }
  laptop();
  expect(serverCapabilities().localRender, "the positive control: a laptop may render").toBe(true);
});

/* ── (a) channel readiness answers from the posture ───────────────────────── */

/** lib/publish/channels.ts, loaded fresh (its PATH probe caches per process). */
function freshChannels(): typeof import("@/lib/publish/channels") {
  const p = path.join(ROOT, "lib", "publish", "channels.ts");
  for (const k of Object.keys(require.cache)) if (path.resolve(k).toLowerCase() === p.toLowerCase()) delete require.cache[k];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(p);
}

/** Replace spawnSync for `fn`, recording every call and answering `found`. */
function withSpawnSync<T>(found: boolean, fn: (calls: string[]) => T): T {
  const mod = childProcess as unknown as Record<string, unknown>;
  const real = mod.spawnSync;
  const calls: string[] = [];
  mod.spawnSync = (cmd: unknown) => {
    calls.push(String(cmd));
    return { status: found ? 0 : 1, stdout: found ? "C:/tools/bin\n" : "", stderr: "" };
  };
  syncBuiltinESMExports();
  try {
    return fn(calls);
  } finally {
    mod.spawnSync = real;
    syncBuiltinESMExports();
  }
}

test("channel readiness: where spawning is forbidden it answers `forbidden` and starts no process", () => {
  for (const posture of [{ LOCAL_BINARIES: "off" }, { K_SERVICE: "gravitone" }, { AWS_LAMBDA_FUNCTION_NAME: "fn" }]) {
    laptop();
    Object.assign(process.env, posture);
    const ch = freshChannels();
    withSpawnSync(true, (calls) => {
      const r = ch.channelReadiness();
      for (const c of r.channels)
        expect(c.cli, `${c.id} under ${JSON.stringify(posture)}`).toEqual([
          { name: "ffmpeg", present: false, forbidden: true },
          { name: "ffprobe", present: false, forbidden: true },
        ]);
      expect(calls, `a process was started under ${JSON.stringify(posture)}`).toEqual([]);
    });
  }
});

test("channel readiness: a forbidding posture wins over a PATH answer cached while spawning was allowed", () => {
  laptop();
  const ch = freshChannels();
  withSpawnSync(true, (calls) => {
    expect(ch.cliPresence().map((c) => c.present), "the positive control: an allowed posture does probe").toEqual([true, true]);
    expect(calls.length).toBe(2);
    process.env.K_SERVICE = "gravitone";
    expect(ch.cliPresence().every((c) => c.forbidden === true && !c.present)).toBe(true);
    expect(calls.length, "the forbidden read spawned").toBe(2);
  });
});

/* ── the seam: the browser asks the server ────────────────────────────────── */

test("the server's answer: the facts behind the matrix, read from their owners", () => {
  laptop();
  process.env.LOCAL_BINARIES = "off";
  const facts = deploymentFacts();
  expect(facts).toEqual({ musicKey: false, localBinaries: false });
  const caps = serverCapabilities();
  expect(caps).toEqual(capabilities(facts));
  expect([caps.musicGenerate, caps.localRender]).toEqual([false, false]);
});

test("source: no file computes the matrix itself - the server passes facts, the browser asks useCapabilities()", () => {
  // The places allowed to call capabilities(facts) directly, each with its
  // reason. Everything else would be guessing at a key it cannot see.
  // lib/useCapabilities.ts retires with the v1 pages that read it (Phase 6 wave C);
  // until its file is gone it keeps its place.
  const ALLOWED: Record<string, string> = {
    "lib/capabilities.ts": "the definition",
    "lib/serverCapabilities.ts": "the server's facts, handed in",
    ...(existsSync(path.join(ROOT, "lib/useCapabilities.ts")) ? { "lib/useCapabilities.ts": "the browser's pending and unanswered views" } : {}),
  };
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.(ts|tsx|mts)$/.test(e.name)) files.push(rel);
    }
  };
  for (const d of ["app", "components", "lib"]) walk(d);
  expect(files.length, "the walk read almost nothing").toBeGreaterThan(200);
  const callers = files.filter((f) => /(^|[^\w.])capabilities\s*\(/.test(stripComments(readFileSync(path.join(ROOT, f), "utf8"))));
  expect(callers.filter((f) => !ALLOWED[f]), "these call capabilities() directly - use useCapabilities() (client) or serverCapabilities() (server)").toEqual([]);
  for (const f of Object.keys(ALLOWED)) expect(callers, `${f} is allowed and no longer calls it - remove it from ALLOWED`).toContain(f);
  const readers = files.filter((f) => /\buseCapabilities\s*\(/.test(stripComments(readFileSync(path.join(ROOT, f), "utf8"))));
  console.log(`[posture] ${files.length} files walked; capabilities() callers: ${callers.length}; useCapabilities() readers: ${readers.join(", ")}`);
  // The client hook retires with the v1 pages (Phase 6 wave C): while it exists something
  // still reads it; once it is gone nothing may.
  if (!existsSync(path.join(ROOT, "lib/useCapabilities.ts"))) expect(readers, "useCapabilities() is gone and still read").toEqual([]);
});
