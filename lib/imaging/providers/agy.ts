// AGY — a CLI-spawned poster generator, not an HTTP vendor.
//
// Every other adapter in this directory calls a vendor's HTTP endpoint with a
// key. This one spawns a general-purpose agentic CLI (`agy`, the operator's own
// install + auth — verified live, not an app dependency) and asks it, in
// English, to call its own `generate_image` tool and save the result to a path
// we name. That is a genuinely different provider shape, so it is stated here
// rather than discovered by a reader diffing this file against leonardo.ts.
//
// WHY A PROSE INSTRUCTION AND NOT A STRUCTURED CALL. `agy -p "<text>"
// --output-format json` is the whole interface this CLI exposes — there is no
// typed `generate_image` RPC to call directly, it is a tool the CLI's own
// agent decides to invoke. So the contract this adapter relies on is: ask for
// a SPECIFIC absolute output path, then read that file after the process
// exits. The JSON response's `response` field is prose describing what the
// agent did; it is NOT parsed for a path (idea note: "do not try to parse a
// path out of the CLI's prose" — the agent's wording is not a wire format).
//
// THE TWO-CHECK GATE. `agyAvailable()` is `canSpawnLocalBinaries()` (this
// could be a managed platform with no shell at all) AND a live `agy
// --version` presence probe (this machine's `agy` might not be installed or
// authenticated). Both are re-checked on every call rather than cached, for
// the same reason lib/imaging/env.ts reads keys lazily — a long-running
// process should not hold a stale "yes" from boot. When either check fails
// this adapter must not look different from one with no key: `isConfigured`
// (lib/imaging/env.ts) special-cases "agy" to call `agyAvailable()` instead of
// reading an env var, which is what lets the router's EXISTING no-key skip
// carry this provider's fallback — no new fallback mechanism was needed.
//
// PORTABILITY: a clone of this repo on a machine without `agy` installed must
// still generate posters, via the Google/Leonardo chain already in
// router.ts's PLAN. This file never changes that chain; it only adds one more
// entry that quietly never serves when the two checks above fail.
//
// MEASURED (this spark's own live verification, not vendor documentation):
// ~57s for one image (114s for two sequential) and a output ceiling of
// 1376x768 — both well under even 1080p-wide. Timeouts and resolution claims
// downstream must not assume better than that.

import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { canSpawnLocalBinaries } from "../../deployment";
import { ImagingError, noKey } from "../errors";
import { priceCall } from "../pricing";
import type { Aspect, GenerateRequest, GeneratedImages, ImageRef, ImagingProvider } from "../types";

/** The `AspectRatio` enum agy's `generate_image` tool accepts, verified live by
 *  generating one of each and reading back the returned pixel dimensions
 *  (1376x768 / 768x1376). This repo's own `Aspect` type is a superset —
 *  `"4:5"` has no equivalent here — so the map is partial and the miss is a
 *  real `invalid-request`, never a silently squashed ratio. */
const AGY_ASPECT: Partial<Record<Aspect, string>> = {
  "16:9": "16:9",
  "9:16": "9:16",
  "1:1": "1:1",
};

/** Measured ~57s per image. Floored well above that so a slow run is not
 *  mistaken for a hang — this MUST run as an async job upstream (WP1's
 *  job-kind contract), never a synchronous request a route blocks on. */
const GENERATE_TIMEOUT_MS = 180_000;

/** `agy --version`, with a short timeout, never throwing. The presence half of
 *  the two-check gate; `canSpawnLocalBinaries()` is the other half. Exported
 *  so `lib/imaging/env.ts#isConfigured("agy")` and this file's own
 *  defence-in-depth check in `generate()` share one predicate rather than two
 *  copies of a spawn. */
export function agyAvailable(): boolean {
  if (!canSpawnLocalBinaries()) return false;
  try {
    // NO SHELL. `agy` resolves to a real `.exe` on this machine (confirmed:
    // `where agy` -> …\agy\bin\agy.exe), unlike `claude` in lib/claudeCli.ts,
    // which needs `shell: true` only because IT resolves to a `.cmd` shim on
    // Windows. `shell: true` concatenates argv into one command line WITHOUT
    // escaping it (claudeCli.ts's own header documents this exact failure
    // mode for a different binary) — measured here too: a multi-word prompt
    // with `shell: true` arrived at agy split on spaces and agy rejected it
    // as an unexpected positional argument. Off-shell, Node passes argv to
    // CreateProcess as a real argument vector and the prompt survives intact.
    const res = spawnSync("agy", ["--version"], { stdio: "ignore", timeout: 5_000 });
    return res.status === 0 && !res.error;
  } catch {
    return false;
  }
}

/** One generation: spawn agy, wait for it to exit, then read the file we
 *  asked it to write. Sequential per call — agy's CLI takes one request at a
 *  time and a batch of N images is N full ~57s turns, not a batch endpoint. */
async function generateOne(prompt: string, ratio: string): Promise<ImageRef> {
  const outPath = join(tmpdir(), `agy-poster-${randomUUID()}.png`);
  const instruction =
    `Use the generate_image tool to create an image of: ${prompt} ` +
    `Set AspectRatio to "${ratio}". Save the result to the absolute path ${outPath} ` +
    "exactly (create any needed directories). Do not respond until the file has been written.";

  await new Promise<void>((resolve, reject) => {
    let child;
    try {
      // NO SHELL — see agyAvailable()'s comment. This matters far more here
      // than on the version probe: the prompt is a multi-word sentence, and
      // shell:true's unescaped concatenation measurably broke it (agy saw the
      // first word of `-p`'s value and rejected the rest as stray arguments).
      // stdout is NEVER read (the design note above: the response's prose is
      // not parsed for a path) — so it stays "ignore", not "pipe". A piped
      // stream nobody consumes is paused by default; agy's JSON response runs
      // to thousands of tokens of prose on a real generation, which can fill
      // the OS pipe buffer and block the child's write(), turning every call
      // into a GENERATE_TIMEOUT_MS hang instead of the ~57s this measured.
      child = spawn("agy", ["-p", instruction, "--output-format", "json"], {
        stdio: ["ignore", "ignore", "pipe"],
      });
    } catch {
      return reject(new ImagingError("The `agy` CLI could not be started.", "failed", "agy"));
    }

    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(
        new ImagingError(
          `agy did not finish within ${GENERATE_TIMEOUT_MS / 1000}s (measured ~57s/image; this run took longer).`,
          "timeout",
          "agy",
        ),
      );
    }, GENERATE_TIMEOUT_MS);

    child.stderr?.on("data", (c) => (stderr += c));
    child.on("error", () => {
      clearTimeout(timer);
      reject(new ImagingError("The `agy` CLI is not installed or not on PATH.", "failed", "agy"));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const tail = stderr.replace(/\s+/g, " ").trim().slice(-240);
        return reject(
          new ImagingError(`agy exited ${code}.${tail ? ` stderr: ${tail}` : ""}`, "bad-response", "agy"),
        );
      }
      resolve();
    });
  });

  let buf: Buffer;
  try {
    buf = await readFile(outPath);
  } catch {
    throw new ImagingError(
      "agy reported success but the output file it was asked to write was not found.",
      "bad-response",
      "agy",
    );
  } finally {
    // Best-effort — a leaked temp PNG is a disk-usage nit, not a result we may
    // fail the call over once the bytes are already in hand.
    unlink(outPath).catch(() => {});
  }

  return { base64: buf.toString("base64"), mime: "image/png" };
}

export function agyProvider(): ImagingProvider {
  return {
    id: "agy",
    // Generation only — agy's `generate_image` tool has no edit/instruction
    // surface, and nothing here claims `recognize`.
    capabilities: ["generate"],
    // The CLI takes no reference-image argument in the shape this spark
    // verified; style-locked requests must not land here (same reasoning as
    // Leonardo's v1 API, see leonardo.ts).
    supportsReferences: false,
    // There is no dedicated negative-prompt channel to declare — agy's whole
    // input is one prose instruction, which is neither "native" nor "prose
    // appended to a positive prompt" in the sense the other adapters mean.
    // Left undefined rather than guessed.

    async generate(req: GenerateRequest): Promise<GeneratedImages> {
      const started = Date.now();
      // Defence in depth: the router already skips an unconfigured provider
      // via `isConfigured("agy")` (env.ts), but a direct caller of this
      // module must get the same honest refusal rather than a hung spawn.
      if (!agyAvailable())
        throw noKey("agy", "the `agy` CLI (not installed, not authenticated, or LOCAL_BINARIES=off)");

      const ratio = AGY_ASPECT[req.aspect];
      if (!ratio)
        throw new ImagingError(
          `agy supports 1:1/16:9/9:16; "${req.aspect}" has no agy equivalent.`,
          "invalid-request",
          "agy",
        );

      const count = Math.max(req.count ?? 1, 1);
      const images: ImageRef[] = [];
      for (let i = 0; i < count; i++) images.push(await generateOne(req.prompt, ratio));

      // No rate card exists for agy's own "AI credits" plan quota — see
      // pricing.ts's agy row. Unpriced is the honest answer, not a guess.
      const price = priceCall({ provider: "agy", model: "agy-image-generator", images: count });

      return {
        images,
        provenance: {
          provider: "agy",
          model: "agy-image-generator",
          // We asked a general agent to run a specific tool; it is not a
          // vendor-confirmed model identifier the way Google's response field
          // is — "requested", not "vendor-reported" (see ModelBasis).
          modelBasis: "requested",
          costUsd: price.usd,
          costBasis: price.basis,
          durationMs: Date.now() - started,
          // No server-side artifact to clean up — unlike Leonardo, agy writes
          // straight to our local filesystem and we already deleted the temp
          // file above.
          cleanup: "not-applicable",
        },
      };
    },
  };
}
