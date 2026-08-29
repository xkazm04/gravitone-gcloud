// PREFLIGHT — what can THIS machine actually run, and what would it take.
//
//   npx tsx pipeline/preflight.mts            # the human ladder
//   npx tsx pipeline/preflight.mts --json     # the same reading, machine-readable
//   npx tsx pipeline/preflight.mts --tails    # + last-4 of each set secret
//
// ── THE PROBLEM ─────────────────────────────────────────────────────────────
//
// Someone clones this repo and has three questions: what works with NO
// configuration, what needs a key, and what needs hardware they may not have.
// Every answer already exists here — in lib/capabilities.ts, lib/deployment.ts,
// lib/localMode.ts, lib/text/{env,router}.ts, lib/imaging/{env,router}.ts,
// lib/music/elevenlabs.ts, lib/apiAuth.ts and 13KB of .env.example prose. None
// of it is reachable to a newcomer, because almost all of it is a SERVER-SIDE
// RUNTIME predicate: it answers after you have configured enough to boot, which
// is exactly when you no longer need to ask.
//
// This script asks those predicates from a bare shell, before anything is
// configured, and prints one ladder.
//
// ── THE RULE THIS FILE IS BUILT ON: IT OWNS NO FACTS ────────────────────────
//
// lib/deployment.ts exists because of one named failure — "one copy in the
// scoring path, another in a side feature added later. The copies then drift."
// A preflight that hardcoded "music needs ELEVENLABS_API_KEY" would be a fourth
// copy of a fact with three homes, and the day the variable is renamed it would
// be the only place still telling a newcomer the old name with total confidence.
//
// So NOTHING here is restated. Every verdict is delegated:
//
//   which capabilities exist at all   Object.entries(capabilities())  — the loop
//                                     iterates the matrix, so a capability ADDED
//                                     to lib/capabilities.ts appears in this
//                                     report with no edit to this file
//   why an absent one is absent       ABSENCE_REASON[key]
//   which flag turns it off           parsed out of lib/capabilities.ts SOURCE,
//                                     so the flag name cannot drift from the
//                                     read that honours it
//   may this box spawn a binary       localPosture() / describePosture()
//   is `claude` actually there        engineStatus() → the adapter's own probe
//   which engine would answer         planFor() in both routers
//   is a vendor key present           isConfigured() ×2, isMusicConfigured()
//   is the money gate open            accessSecret() / ACCESS_SECRET_VAR
//   is auth satisfiable               LOCAL_MODE, firebaseReady, FIREBASE_VARS
//   what a remedy costs and where     the comment block .env.example already
//                                     wrote above that variable, quoted, not
//                                     paraphrased
//
// The only strings this file authors are labels and the three outcome words.
//
// ── THREE OUTCOMES, NEVER TWO ───────────────────────────────────────────────
//
// A setup guide that sorts the world into configured / unconfigured implies
// everything is one key away. lib/capabilities.ts exists to prevent exactly that
// claim, so every row lands in one of:
//
//   reachable      it works right now, on this machine, as checked out
//   after-action   a NAMED action makes it work — the variable, and the vendor
//                  page .env.example itself links
//   absent         no key changes this: wrong hardware, wrong posture, or a
//                  vendor feature with no equivalent. ABSENCE_REASON says why.
//
// ── POSTURE AND PROBE ARE TWO COLUMNS ───────────────────────────────────────
//
// lib/deployment.ts: "'is a local binary possible here' and 'is `claude`
// installed and logged in' are different questions with different answers and
// different remedies, and collapsing them is how an offline policy flag gets
// deleted by someone fixing a 'binary missing' report." The table keeps them
// apart. A box that MAY spawn but has nothing installed reads differently from
// one where LOCAL_BINARIES=off.
//
// ── WHAT IT COSTS: NOTHING, AND NOT BY LUCK ─────────────────────────────────
//
// No vendor is contacted. Both text probes are network-free by construction —
// the google adapter's probe is a key-PRESENCE check that says so in its own
// detail string, and the claude adapter's is `claude --version`. Key presence is
// not key validity and this script never claims otherwise; a revoked key reads
// green here and red on the first real call. `nvidia-smi` is asked before
// guard.py is, because guard.py's status() calls nvidia-smi unguarded and dies
// with a traceback on a box that has none — see NOTES in the output.
//
// SECRETS ARE NEVER PRINTED. Presence only, and last-4 solely under `--tails`,
// so the default output is safe to paste into a report or an issue.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ROOT = path.resolve(import.meta.dirname, "..");

/** Load .env then .env.local without clobbering anything already exported.
 *  Next does this for the app; a bare tsx process gets nothing. The same six
 *  lines as pipeline/verify-text-engine.mts and its siblings — the house
 *  pattern for a driver that has to see the operator's real environment. */
function loadEnv(root: string) {
  for (const f of [".env", ".env.local"]) {
    const at = path.join(root, f);
    if (!fs.existsSync(at)) continue;
    for (const line of fs.readFileSync(at, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      if (v && process.env[k] === undefined) process.env[k] = v;
    }
  }
}
loadEnv(ROOT);

/* DEP0190 — node 24 warns whenever a child is spawned as `(cmd, args[])` with
 * `shell: true`. This script never does that (see `run` below), but two lines it
 * REUSES do: lib/claudeCli.ts's `probeClaude` and `runClaude` spawn
 * `("claude", ["--version"], { shell: USES_SHELL })`. Reusing the repo's real
 * probe rather than re-deriving it is the whole design of this file, so the
 * warning arrives with the reuse. It is filtered out of THIS report and named in
 * NOTES instead — reported, not hidden, and not fixed here: lib/claudeCli.ts is
 * not this script's file to edit. Every other warning still prints. */
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (!/DEP0190/.test(String((w as Error & { code?: string }).code ?? ""))) console.warn(w);
});

const WANT_JSON = process.argv.includes("--json");
const WANT_TAILS = process.argv.includes("--tails");

/* ── The repo's own predicates ─────────────────────────────────────────────
 *
 * Imported DYNAMICALLY, after loadEnv, and that is load-bearing rather than
 * stylistic: lib/localMode.ts computes LOCAL_MODE at module scope, so a static
 * import would be hoisted above loadEnv and would read an environment that had
 * not been filled in yet. Same reason verify-text-engine.mts does it. */

const { capabilities, ABSENCE_REASON } = await import("../lib/capabilities");
const { localPosture, describePosture } = await import("../lib/deployment");
const { LOCAL_MODE } = await import("../lib/localMode");
const { firebaseReady, FIREBASE_VARS } = await import("../lib/firebase");
const textEnvMod = await import("../lib/text/env");
const { engineStatus, planFor: textPlanFor } = await import("../lib/text/router");
const imagingEnvMod = await import("../lib/imaging/env");
const { planFor: imagingPlanFor } = await import("../lib/imaging/router");
const { leonardoProvider } = await import("../lib/imaging/providers/leonardo");
const { googleProvider } = await import("../lib/imaging/providers/google");
const { qwenProvider } = await import("../lib/imaging/providers/qwen");
const { isMusicConfigured, MUSIC_KEY_VAR } = await import("../lib/music/elevenlabs");
const { ACCESS_SECRET_VAR, accessSecret } = await import("../lib/apiAuth");

/** The browser copy of the access secret. Its NAME is derived from the server
 *  one rather than typed, because lib/apiAuth.ts owns the stem and the pair is
 *  what the gate needs — writing one without the other fails closed. */
const ACCESS_SECRET_PUBLIC_VAR = `NEXT_PUBLIC_${ACCESS_SECRET_VAR}`;

/** The one variable name this file spells out, because lib/localMode.ts exports
 *  the PREDICATE (`LOCAL_MODE`) and not the name behind it. It is not trusted:
 *  the .env.example cross-check below reports it as a discrepancy if the name
 *  ever stops appearing there, so a rename surfaces instead of quietly lying. */
const LOCAL_MODE_VAR = "NEXT_PUBLIC_LOCAL_MODE";

/* ── .env.example, read as documentation rather than paraphrased ───────────
 *
 * Every remedy sentence in this report is the comment block .env.example
 * already carries above the variable in question. Quoting it means a vendor URL
 * or a caveat added there reaches a newcomer through this script without anyone
 * remembering to copy it, and it means this file cannot disagree with it. */

interface EnvDocEntry {
  /** The comment block immediately above the declaration. */
  comment: string[];
  /** First link-shaped thing in that block, if any. */
  url?: string;
  /** 1-based line of the declaration, for a "go and read it" pointer. */
  line: number;
}

function readEnvExample(): Map<string, EnvDocEntry> {
  const out = new Map<string, EnvDocEntry>();
  const at = path.join(ROOT, ".env.example");
  if (!fs.existsSync(at)) return out;
  const lines = fs.readFileSync(at, "utf8").split(/\r?\n/);
  let block: string[] = [];
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (line.startsWith("#")) {
      block.push(line.replace(/^#\s?/, ""));
      return;
    }
    const m = /^([A-Z0-9_]+)=/.exec(line.trim());
    if (m) {
      const text = block.join("\n");
      // A LINK, not any slashed token. An earlier draft accepted
      // `[a-z0-9-]+(\.[a-z0-9-]+)+/…` and duly offered "0.5K/1K/2K/4K." as the
      // vendor page for GOOGLE_AI_API_KEY — a fabricated remedy, which is the
      // one thing this file must never produce. So: an explicit scheme, or a
      // real TLD.
      const url = /\bhttps?:\/\/[^\s,)]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:ai|com|io|dev|org|app|net|co)\/[^\s,)]+/i.exec(
        text,
      )?.[0];
      out.set(m[1]!, { comment: block.filter((l) => l.trim()), url, line: i + 1 });
      block = [];
      return;
    }
    if (!line.trim()) return; // a blank line inside a block keeps the block
    block = [];
  });
  return out;
}
const ENV_DOC = readEnvExample();

/** The first sentence of what .env.example says about a variable — the remedy
 *  in the repo's own words. Section-banner lines are skipped: they describe the
 *  block, not the variable. */
function docHint(v: string): string | undefined {
  const e = ENV_DOC.get(v);
  if (!e) return undefined;
  const body = e.comment.filter((l) => !/^─|^──|^\s*$/.test(l) && !/^\s*──/.test(l));
  const text = body.join(" ").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  const stop = text.indexOf(". ");
  return stop > 0 ? text.slice(0, stop + 1) : text;
}
function docUrl(v: string): string | undefined {
  return ENV_DOC.get(v)?.url;
}

/* ── Secret presence, never secret value ──────────────────────────────────── */

function present(v: string): boolean {
  const raw = process.env[v];
  return Boolean(raw && raw.trim());
}
function shownAs(v: string): string {
  if (!present(v)) return "unset";
  if (!WANT_TAILS) return "set";
  const raw = process.env[v]!.trim();
  return `set (…${raw.slice(-4)})`;
}

/* ── Machine probes — read-only, local, and none of them a vendor call ───── */

/** A local, read-only probe. The command is a single string run through the
 *  shell — never `(cmd, args[])` with `shell: true`, which node 24 deprecates
 *  (DEP0190) because the args are concatenated unescaped. Every command here is
 *  a literal in this file with no interpolated input, so there is nothing to
 *  escape; the shell is only needed so a `.cmd`/`.bat` shim on PATH resolves. */
function run(cmdline: string): { ok: boolean; out: string } {
  try {
    const r = spawnSync(cmdline, { cwd: ROOT, encoding: "utf8", shell: true, timeout: 20_000, windowsHide: true });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
    return { ok: r.status === 0, out };
  } catch (e) {
    return { ok: false, out: e instanceof Error ? e.message : String(e) };
  }
}

const nvidia = run("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader");
const gpuLine = nvidia.ok ? nvidia.out.split(/\r?\n/)[0]!.trim() : "";

/** guard.py's status(), but only where it can survive. Its very first call is
 *  `nvidia-smi`, unguarded, so on a box without one it exits with a traceback
 *  rather than a reading. Asking nvidia-smi first turns that crash into a
 *  finding. Not our file to fix — reported in NOTES. */
const guard = gpuLine
  ? run("python pipeline/vlm-probe/guard.py --status")
  : { ok: false, out: "not run — no nvidia-smi on this machine, and guard.py --status calls it unguarded" };

const notes: string[] = [
  "lib/claudeCli.ts spawns `claude` as (cmd, args[]) with `shell: true`, which node 24 flags as " +
    "DEP0190. This report filters that one warning out of its own output rather than editing a file it " +
    "does not own. Reported, not fixed.",
];
if (!gpuLine)
  notes.push(
    "pipeline/vlm-probe/guard.py --status exits with a Python traceback (FileNotFoundError on `nvidia-smi`) " +
      "on a machine with no NVIDIA driver. This preflight probes nvidia-smi first and skips guard.py rather " +
      "than reproducing the crash. Reported, not fixed — guard.py is not this script's file.",
  );

/* ── The ladder ───────────────────────────────────────────────────────────── */

type Outcome = "reachable" | "after-action" | "absent";

interface Row {
  id: string;
  label: string;
  outcome: Outcome;
  /** What this DEPLOYMENT allows — config, flags, platform. */
  posture: string;
  /** What was MEASURED on this machine. Never folded into posture. */
  probe: string;
  /** The remedy (after-action) or the reason (absent), in the repo's words. */
  why: string;
  /** Which predicate decided it, so a reader can go and disagree with the code. */
  source: string;
  vars?: string[];
  url?: string;
}

const rows: Row[] = [];
const add = (r: Row) => rows.push(r);

const posture = localPosture();
const textEnv = textEnvMod.currentTextEnv();
const imgEnv = imagingEnvMod.currentEnv();
const gateOpen = Boolean(accessSecret());
const gatePairOk = gateOpen && present(ACCESS_SECRET_PUBLIC_VAR);

/* 1 · the studio itself — the fact a newcomer is never told first */

add({
  id: "studio-shell",
  label: "Studio · projects · steps · themes · assets",
  outcome: "reachable",
  posture: "no server, no Firestore",
  probe: "browser-side — not measurable here",
  why:
    "Projects, steps, themes and assets live in the browser's IndexedDB (lib/studioDb.ts) with no " +
    "dependency and no backend. Nothing on this list needs a credential. The probe column is honest " +
    "about its ceiling: a shell cannot open an IndexedDB, so this row is a posture reading, not a measurement.",
  source: "lib/studioDb.ts · lib/localMode.ts header",
});

/* 2 · auth — the zero-credential path, and the other one */

if (LOCAL_MODE)
  add({
    id: "auth",
    label: "Sign-in / identity",
    outcome: "reachable",
    posture: `${LOCAL_MODE_VAR}=1 — fixed local owner`,
    probe: `firebaseReady=${firebaseReady}`,
    why:
      "Local mode satisfies the auth gate with a stable local identity, in any build. Work is scoped to " +
      "this browser profile and synced nowhere — that is the posture, and the caveat.",
    source: "lib/localMode.ts · LOCAL_MODE",
    vars: [LOCAL_MODE_VAR],
  });
else if (firebaseReady)
  add({
    id: "auth",
    label: "Sign-in / identity",
    outcome: "reachable",
    posture: "Firebase web config present",
    probe: "firebaseReady=true (config only)",
    why:
      "All three Firebase variables are set, so the Google sign-in popup can run. Whether the project " +
      "accepts this origin is its authorized-domain list's answer, not this script's.",
    source: "lib/firebase.ts · firebaseReady",
    vars: [...FIREBASE_VARS],
  });
else
  add({
    id: "auth",
    label: "Sign-in / identity",
    outcome: "after-action",
    posture: "gate fails closed — no identity",
    probe: `firebaseReady=false, ${LOCAL_MODE_VAR}=${process.env[LOCAL_MODE_VAR] ?? "unset"}`,
    why:
      `CHEAPEST PATH FIRST: set ${LOCAL_MODE_VAR}=1 and the studio runs now, with zero credentials and ` +
      `zero accounts — every phase surface, projects, themes, assets. ` +
      (docHint(LOCAL_MODE_VAR) ?? "") +
      ` The other path is a Firebase web app: ${FIREBASE_VARS.join(", ")} (a partial config is a missing config).`,
    source: "lib/localMode.ts · lib/firebase.ts",
    vars: [LOCAL_MODE_VAR, ...FIREBASE_VARS],
    url: docUrl(LOCAL_MODE_VAR),
  });

/* 3 · the money/compute gate — every server route below depends on it */

add({
  id: "access-gate",
  label: "Server route access gate",
  outcome: gatePairOk ? "reachable" : "after-action",
  posture: gateOpen ? "secret set — routes open" : "unset — every gated route 401s",
  probe: `${ACCESS_SECRET_VAR}=${shownAs(ACCESS_SECRET_VAR)}, ${ACCESS_SECRET_PUBLIC_VAR}=${shownAs(ACCESS_SECRET_PUBLIC_VAR)}`,
  why: gatePairOk
    ? "Both halves are set, so the studio's own UI can reach the gated routes."
    : gateOpen
      ? `${ACCESS_SECRET_VAR} is set but ${ACCESS_SECRET_PUBLIC_VAR} is not. The browser can only present a ` +
        "secret that shipped in its bundle, so the studio's UI is locked out of its own routes. Set both, to the same value."
      : `The gate FAILS CLOSED: with no ${ACCESS_SECRET_VAR}, every gated route answers 401 — imaging, music, ` +
        `frames, recalibrate and foundry. This is NOT a vendor credential: it is a locally-chosen shared secret, ` +
        `so any hard-to-guess string works, and it must be written to BOTH ${ACCESS_SECRET_VAR} and ` +
        `${ACCESS_SECRET_PUBLIC_VAR} in the same edit.`,
  source: "lib/apiAuth.ts · accessSecret() / checkAccess()",
  vars: [ACCESS_SECRET_VAR, ACCESS_SECRET_PUBLIC_VAR],
});

/* 4 · reasoning — the ladder with no floor */

const status = await engineStatus("edit-plan");
const cliProbe = status.candidates.find((c) => c.provider === "claude-cli");
const cloudProbe = status.candidates.find((c) => c.provider === "google");
const textPlan = textPlanFor("edit-plan", textEnv);

add({
  id: "reasoning-local",
  label: "Reasoning · rung 1 (claude CLI)",
  // THE THREE OUTCOMES FOLLOW lib/deployment.ts's OWN DISTINCTION, which is the
  // whole reason that file separates its two "unavailable" postures:
  //   policy-forbidden → AFTER-ACTION. "the remedy is a flag, not a migration."
  //   managed-platform → ABSENT. "no amount of configuration changes that."
  // Collapsing them into one red row is exactly the mistake that gets an
  // offline policy flag deleted by someone fixing a "binary missing" report.
  outcome: cliProbe?.ok ? "reachable" : posture === "managed-platform" ? "absent" : "after-action",
  posture: `${posture} — ${describePosture(posture)}`.slice(0, 200),
  probe: cliProbe ? (cliProbe.ok ? "binary answers --version" : "binary did not answer") : "not in this posture's plan",
  why:
    posture === "policy-forbidden"
      ? `${describePosture(posture)} — and the remedy is a FLAG, not an install. Unset LOCAL_BINARIES (or ` +
        "set it to `on`) to hand this rung back. Nothing here says the binary is missing, because nothing here looked."
      : cliProbe
        ? cliProbe.detail
        : `The CLI is not a candidate in the \`${textEnv}\` posture: ${describePosture(posture)}. Listing a ` +
          "structurally impossible candidate would put a guaranteed elimination in every trail.",
  source: "lib/deployment.ts · localPosture() + lib/claudeCli.ts · probeClaude()",
});

add({
  id: "reasoning-cloud",
  label: "Reasoning · rung 2 (Gemini, metered)",
  outcome: textEnvMod.isConfigured("google") ? "reachable" : "after-action",
  posture: `text env \`${textEnv}\` · plan ${textPlan.join(" → ")}`,
  probe: cloudProbe?.detail.split(".")[0] ?? `${textEnvMod.KEY_VAR.google} ${shownAs(textEnvMod.KEY_VAR.google!)}`,
  why: textEnvMod.isConfigured("google")
    ? `${textEnvMod.KEY_VAR.google} is present. Presence is not validity — a revoked key reads green here and ` +
      "is discovered on the first real turn."
    : `Set ${textEnvMod.KEY_VAR.google} in .env.local. ${docHint(textEnvMod.KEY_VAR.google!) ?? ""}`,
  source: "lib/text/env.ts · isConfigured('google')",
  vars: [textEnvMod.KEY_VAR.google!],
  url: docUrl(textEnvMod.KEY_VAR.google!),
});

add({
  id: "reasoning-floor",
  label: "Reasoning · rung 3 (a no-model floor)",
  outcome: "absent",
  posture: "no floor, by design",
  probe: "not applicable",
  why:
    "There is no heuristic that writes an edit plan over a creator's notebook and no rule-based art " +
    "direction — the first version of that step WAS such a table and it produced a narrated slide deck. " +
    "So the bottom of this ladder is an honest refusal naming every engine tried and why each dropped out, " +
    "not a silent stand-in. `LadderRung` has no `floor` member so nothing can quietly claim otherwise.",
  source: "lib/text/router.ts · NO FLOOR",
});

/* 5 · imaging — one row per capability the providers actually implement */

const imagingCaps = [...new Set([leonardoProvider(), googleProvider(), qwenProvider()].flatMap((p) => p.capabilities))];
for (const cap of imagingCaps) {
  const chain = imagingPlanFor(cap, imgEnv);
  const live = chain.filter((p) => imagingEnvMod.isConfigured(p));
  const missing = chain.filter((p) => !imagingEnvMod.isConfigured(p));
  const ok = live.length > 0 && gatePairOk;
  const firstMissing = missing[0];
  add({
    id: `imaging-${cap}`,
    label: `Imaging · ${cap}`,
    outcome: ok ? "reachable" : "after-action",
    posture: `imaging env \`${imgEnv}\` · plan ${chain.join(" → ")}`,
    probe: chain.map((p) => `${p}:${imagingEnvMod.isConfigured(p) ? "key" : "—"}`).join(" "),
    why: ok
      ? `${live.join(", ")} ${live.length === 1 ? "has" : "have"} a key and the access gate is open. ` +
        "Key presence is not key validity, and no vendor was contacted to check."
      : [
          live.length === 0 && firstMissing
            ? `Set ${imagingEnvMod.KEY_VAR[firstMissing]}. ${docHint(imagingEnvMod.KEY_VAR[firstMissing]) ?? ""}`
            : "",
          gatePairOk ? "" : `AND open the route gate: ${ACCESS_SECRET_VAR} + ${ACCESS_SECRET_PUBLIC_VAR}.`,
        ]
          .filter(Boolean)
          .join(" "),
    source: "lib/imaging/router.ts · planFor() + lib/imaging/env.ts · isConfigured()",
    vars: [...chain.map((p) => imagingEnvMod.KEY_VAR[p]), ACCESS_SECRET_VAR, ACCESS_SECRET_PUBLIC_VAR],
    url: firstMissing ? docUrl(imagingEnvMod.KEY_VAR[firstMissing]) : undefined,
  });
}

/* 6 · THE CAPABILITY MATRIX, ENUMERATED — not transcribed
 *
 * This loop is the acceptance test for "own no facts". It walks whatever
 * capabilities() returns. A capability ADDED to lib/capabilities.ts appears here
 * on the next run with no edit to this file: its flag name is parsed out of that
 * module's own source, its absence sentence comes from ABSENCE_REASON, and with
 * no gate registered below it reports the flag alone and SAYS that is all it
 * checked — rather than inventing a verdict it has no basis for. */

/** The `key: on(process.env.FLAG, …)` pairs, read from lib/capabilities.ts's
 *  source. Parsed rather than typed because the module deliberately spells each
 *  `process.env.X` out literally (the bundler inlines it), which makes the
 *  source the one place where flag and capability are bound together. */
function capabilityFlagVars(): Map<string, string> {
  const out = new Map<string, string>();
  const at = path.join(ROOT, "lib", "capabilities.ts");
  if (!fs.existsSync(at)) return out;
  const src = fs.readFileSync(at, "utf8");
  const re = /(\w+):\s*on\(\s*process\.env\.([A-Z0-9_]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.set(m[1]!, m[2]!);
  return out;
}
const CAP_FLAG = capabilityFlagVars();

/** What each capability needs BEYOND its flag, expressed as a call into the
 *  owning domain's own predicate. Deliberately `Partial` and keyed loosely: an
 *  unregistered capability degrades to "flag only", which is the honest answer,
 *  instead of failing to appear. */
interface CapGate {
  outcome: Outcome;
  posture?: string;
  probe: string;
  why: string;
  source: string;
  vars?: string[];
  url?: string;
}
const musicGate = (): CapGate => {
  const key = isMusicConfigured();
  return {
    outcome: key && gatePairOk ? "reachable" : "after-action",
    probe: `${MUSIC_KEY_VAR}=${shownAs(MUSIC_KEY_VAR)}, gate=${gatePairOk ? "open" : "closed"}`,
    why:
      key && gatePairOk
        ? `${MUSIC_KEY_VAR} is present and the route gate is open. No vendor was contacted; presence is not validity.`
        : [
            key ? "" : `Set ${MUSIC_KEY_VAR}. ${docHint(MUSIC_KEY_VAR) ?? ""}`,
            gatePairOk ? "" : `AND open the route gate: ${ACCESS_SECRET_VAR} + ${ACCESS_SECRET_PUBLIC_VAR}.`,
          ]
            .filter(Boolean)
            .join(" "),
    source: "lib/music/elevenlabs.ts · isMusicConfigured()",
    vars: [MUSIC_KEY_VAR, ACCESS_SECRET_VAR, ACCESS_SECRET_PUBLIC_VAR],
    url: docUrl(MUSIC_KEY_VAR),
  };
};
const CAP_GATE: Partial<Record<string, () => CapGate>> = {
  musicGenerate: musicGate,
  musicSectionEdit: musicGate,
  musicSfx: musicGate,
  localVideoRender: () => ({
    // HARDWARE, so the third outcome rather than the second: no key changes it.
    outcome: gpuLine ? "reachable" : "absent",
    probe: gpuLine ? `${gpuLine} · guard: ${guard.ok ? "readable" : "not read"}` : "no nvidia-smi on PATH",
    why: gpuLine
      ? `A GPU is present. Headroom is the guard's call, not this script's — run \`python pipeline/vlm-probe/guard.py --status\`. ` +
        `The annotator alone was measured at 22.3GB resident, so this wants a 24GB-class card.`
      : "No NVIDIA GPU is reachable from this shell. Clip rendering needs a local GPU rig running ComfyUI with " +
        "24GB-class VRAM and the headroom guards in pipeline/vlm-probe/guard.py. No credential substitutes for a card.",
    source: "nvidia-smi + pipeline/vlm-probe/guard.py --status",
  }),
  desktopTooling: () => ({
    // Same split as the CLI rung: a policy flag is an action, a managed platform is not.
    outcome: posture === "available" ? "reachable" : posture === "managed-platform" ? "absent" : "after-action",
    probe: `${os.platform()} ${os.release()}`,
    why:
      posture === "available"
        ? "The app and the operator share this machine, which is the whole premise of this row."
        : posture === "policy-forbidden"
          ? `${describePosture(posture)}. That flag is about spawning, not about the desktop — but this row ` +
            "reads the same posture, so unset LOCAL_BINARIES if you meant to keep desktop hand-offs."
          : ABSENCE_REASON.desktopTooling,
    source: "lib/deployment.ts · localPosture()",
  }),
};

/** One row per entry in the matrix. The matrix is a PARAMETER rather than a
 *  direct `capabilities()` call, purely so `--selftest` can hand it a matrix
 *  with an extra key and prove, on this machine, that a capability added to
 *  lib/capabilities.ts reaches the report through this loop alone. */
function capabilityRows(caps: Readonly<Record<string, boolean>>): Row[] {
  const out: Row[] = [];
for (const [key, flagOn] of Object.entries(caps)) {
  const flagVar = CAP_FLAG.get(key);
  const reason = (ABSENCE_REASON as Record<string, string | undefined>)[key];
  const flagState = flagVar ? (process.env[flagVar]?.trim() || "unset") : "unknown";
  const posturedFlag = flagVar
    ? `${flagVar}=${flagState} → ${flagOn ? "on" : "off"}`
    : `flag not found in lib/capabilities.ts source → ${flagOn ? "on" : "off"}`;

  if (!flagOn) {
    out.push({
      id: `cap-${key}`,
      label: `Capability · ${key}`,
      outcome: "absent",
      posture: posturedFlag,
      probe: "not probed — the matrix says this deployment does not offer it",
      why:
        reason ??
        `Turned off in this deployment. lib/capabilities.ts declares no ABSENCE_REASON for \`${key}\`, which is ` +
          `itself the finding: a capability that can be absent needs a sentence explaining why.`,
      source: "lib/capabilities.ts · capabilities() + ABSENCE_REASON",
      vars: flagVar ? [flagVar] : undefined,
    });
    continue;
  }

  const gate = CAP_GATE[key]?.();
  out.push({
    id: `cap-${key}`,
    label: `Capability · ${key}`,
    outcome: gate?.outcome ?? "reachable",
    posture: gate?.posture ?? posturedFlag,
    probe: gate?.probe ?? "flag only — no probe registered for this capability",
    why:
      gate?.why ??
      `NEW OR UNREGISTERED CAPABILITY. The matrix says it is on here and this preflight has no probe for it, ` +
        `so the flag is all that was checked — stated rather than dressed up as a verdict. ` +
        (reason ? `When it is absent, lib/capabilities.ts explains: "${reason}"` : ""),
    source: gate?.source ?? "lib/capabilities.ts · capabilities()",
    vars: gate?.vars ?? (flagVar ? [flagVar] : undefined),
    url: gate?.url,
  });
}
  return out;
}
// `Capabilities` is an interface, and TypeScript grants an implicit index signature
// to an anonymous object type but never to an interface — so the matrix is spread
// into one. Nothing is filtered or renamed on the way through.
for (const r of capabilityRows({ ...capabilities() })) add(r);

/* ── .env.example vs lib/ — reported, never corrected ─────────────────────── */

const wantedVars = [
  LOCAL_MODE_VAR,
  ...FIREBASE_VARS,
  ...Object.values(textEnvMod.KEY_VAR).filter((v): v is string => Boolean(v)),
  ...Object.values(imagingEnvMod.KEY_VAR),
  MUSIC_KEY_VAR,
  ACCESS_SECRET_VAR,
  ACCESS_SECRET_PUBLIC_VAR,
  ...CAP_FLAG.values(),
];
const discrepancies = [...new Set(wantedVars)]
  .filter((v) => !ENV_DOC.has(v))
  .map((v) => `${v} is read by lib/ but is not declared in .env.example.`);

/* ── SELF-TEST — the one claim this file makes about itself ───────────────
 *
 *   npx tsx pipeline/preflight.mts --selftest
 *
 * The design rule above is "own no facts", and its sharpest consequence is:
 * ADDING A CAPABILITY TO lib/capabilities.ts MUST SHOW UP HERE WITH NO EDIT TO
 * THIS FILE. That is a claim, and a claim nobody runs is folklore — the same
 * argument pipeline/verify-text-engine.mts opens with.
 *
 * So this hands `capabilityRows` a matrix that is the real one plus two keys it
 * has never heard of, and prints what comes out. It proves the loop is driven by
 * the matrix rather than by a list here, and it proves the honest degradation:
 * an unregistered capability reports the flag ALONE and says so, instead of
 * inventing a verdict. It cannot prove the flag-name parse for a key that does
 * not exist in the source — and the output says that too, rather than implying
 * the parser found something.
 *
 * It writes nothing, spawns nothing and asserts nothing about the operator's
 * machine, so it is safe to run anywhere. */
if (process.argv.includes("--selftest")) {
  const real = capabilities();
  const augmented = { ...real, hypotheticalNewThing: true, hypotheticalOffThing: false };
  const extra = capabilityRows(augmented).filter((r) => !(r.id.slice(4) in real));
  console.log(`\nSELF-TEST · two capabilities that exist in no source file, put through the same loop\n`);
  for (const r of extra) {
    console.log(`  [${r.outcome}] ${r.label}`);
    console.log(`     posture : ${r.posture}`);
    console.log(`     probe   : ${r.probe}`);
    console.log(`     why     : ${r.why}`);
  }
  console.log(
    `\n  ${extra.length} of 2 synthetic capabilities reached the report. The loop reads the matrix, not a list\n` +
      "  in this file, so a real capability added to lib/capabilities.ts arrives the same way. Its ABSENCE_REASON\n" +
      "  and its NEXT_PUBLIC_CAP_ flag are read from that module too — which these synthetic ones have not got,\n" +
      "  and the rows above say so instead of pretending.\n",
  );
  process.exit(0);
}

/* ── Output ───────────────────────────────────────────────────────────────── */

const machine = {
  node: process.version,
  platform: `${os.platform()} ${os.arch()} ${os.release()}`,
  claudeCli: cliProbe?.detail ?? "not probed",
  gpu: gpuLine || null,
  envLocal: fs.existsSync(path.join(ROOT, ".env.local")) ? "present" : "absent",
};

const report = {
  generatedAt: new Date().toISOString(),
  machine,
  posture: {
    localPosture: posture,
    describe: describePosture(posture),
    textEnv,
    imagingEnv: imgEnv,
    localMode: LOCAL_MODE,
    firebaseReady,
    accessGate: gatePairOk ? "open" : gateOpen ? "server-only" : "closed",
    reasoningServing: status.serving,
  },
  counts: {
    reachable: rows.filter((r) => r.outcome === "reachable").length,
    afterAction: rows.filter((r) => r.outcome === "after-action").length,
    absent: rows.filter((r) => r.outcome === "absent").length,
  },
  rows,
  discrepancies,
  notes,
};

if (WANT_JSON) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const GLYPH: Record<Outcome, string> = { reachable: "OK ", "after-action": " → ", absent: " x " };
  const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));
  const rule = (s: string) => console.log(`\n${s}\n${"─".repeat(Math.max(s.length, 40))}`);

  console.log(`\nGRAVITONE STUDIO · PREFLIGHT — what this machine can actually run`);
  console.log(`${report.generatedAt}   node ${machine.node}   ${machine.platform}`);

  rule("POSTURE — what this deployment ALLOWS (config, flags, platform)");
  console.log(`  local posture   ${posture} — ${describePosture(posture)}`);
  console.log(`  text env        ${textEnv}   (TEXT_ENV=${process.env.TEXT_ENV?.trim() || "unset"}, LOCAL_BINARIES=${process.env.LOCAL_BINARIES?.trim() || "unset"})`);
  console.log(`  imaging env     ${imgEnv}    (IMAGING_ENV=${process.env.IMAGING_ENV?.trim() || "unset"})`);
  console.log(`  local mode      ${LOCAL_MODE ? "on" : "off"}    (${LOCAL_MODE_VAR}=${process.env[LOCAL_MODE_VAR]?.trim() || "unset"})`);
  console.log(`  route gate      ${report.posture.accessGate}`);

  rule("PROBE — what was MEASURED here (never folded into the posture above)");
  console.log(`  claude CLI      ${machine.claudeCli}`);
  console.log(`  reasoning       ${status.serving ? `${status.serving} would serve an edit-plan turn` : "NOBODY would serve an edit-plan turn"}`);
  console.log(`  gpu             ${gpuLine || "no nvidia-smi on PATH"}`);
  console.log(`  .env.local      ${machine.envLocal}${WANT_TAILS ? "" : "   (secret values never printed; --tails shows last-4)"}`);

  rule(
    `THE LADDER — ${report.counts.reachable} reachable now · ${report.counts.afterAction} after a named action · ${report.counts.absent} absent here`,
  );
  console.log(`  ${pad("", 3)} ${pad("CAPABILITY", 36)} ${pad("POSTURE (allowed)", 40)} PROBE (measured)`);
  for (const r of rows)
    console.log(`  ${GLYPH[r.outcome]} ${pad(r.label, 36)} ${pad(r.posture, 40)} ${pad(r.probe, 46)}`);

  const now = rows.filter((r) => r.outcome === "reachable");
  if (now.length) {
    rule("OK REACHABLE NOW — nothing further to do for these");
    for (const r of now) console.log(`  · ${pad(r.label, 36)} ${r.why.split(". ")[0]!.replace(/\.$/, "")}.`);
  }

  const todo = rows.filter((r) => r.outcome === "after-action");
  if (todo.length) {
    rule("→ AFTER A NAMED ACTION — cheapest first");
    todo.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.label}`);
      console.log(`     ${r.why}`);
      if (r.vars?.length) console.log(`     vars: ${[...new Set(r.vars)].join(", ")}`);
      if (r.url) console.log(`     see : ${r.url}`);
      console.log(`     src : ${r.source}`);
    });
  }

  const gone = rows.filter((r) => r.outcome === "absent");
  if (gone.length) {
    rule("x ABSENT HERE — no key changes these");
    for (const r of gone) {
      console.log(`  · ${r.label}`);
      console.log(`    ${r.why}`);
      console.log(`    src : ${r.source}`);
    }
  }

  rule("DISCREPANCIES — .env.example vs what lib/ reads");
  if (discrepancies.length) for (const d of discrepancies) console.log(`  ! ${d}`);
  else console.log("  none — every variable lib/ reads is declared in .env.example.");

  if (notes.length) {
    rule("NOTES");
    for (const n of notes) console.log(`  · ${n}`);
  }

  console.log(
    "\nNo vendor was contacted and nothing was spent. A key that is SET is not a key that is VALID —\n" +
      "that is discovered on the first real call, and this report never claims otherwise.\n",
  );
}
