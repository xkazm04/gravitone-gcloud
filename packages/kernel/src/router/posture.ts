import { err, ok, type Result } from "@gt/domain/errors";
import type { LocalPosture, Posture } from "./types.ts";

// POSTURE - what this deployment may do, read once from an environment map.
//
// Absorbed from three v1 readers that each consulted process.env per call:
// lib/deployment.ts localPosture (LOCAL_BINARIES and the managed-platform
// markers), lib/imaging/env.ts currentEnv (IMAGING_ENV, else NODE_ENV) and
// lib/text/env.ts currentTextEnv / retrievalEnabled (TEXT_ENV, TEXT_RETRIEVE).
// Kept: the per-call reading (the driver calls this with the live env each
// time, so a process that booted before .env.local was filled never holds a
// stale answer), LOCAL_BINARIES honoured in both directions, and the narrow
// marker list, whose false positive costs a working engine.
//
// UPGRADED: a malformed value FAILS instead of falling through. v1 let a
// garbage TEXT_ENV fall to the posture and a garbage TEXT_RETRIEVE read as off -
// both chosen as the direction that does not widen spend. A refusal is safer
// still: a typo in a setting that decides which backend serves is a
// misconfiguration, and it must never reach a fallback where nothing logs it
// (optional-dependency-degradation: absent-degrades-malformed-fails-fast).
// Absent still degrades exactly as v1 did.
//
// It is a pure function of the map it is handed: the router never reads the
// environment (model-routing: consumer-overrides - "an override read inside the
// router is an invisible global").

export type Env = Readonly<Record<string, string | undefined>>;

/** Each platform's own always-present marker (lib/deployment.ts MANAGED_MARKERS). */
export const MANAGED_MARKERS = ["K_SERVICE", "K_REVISION", "CLOUD_RUN_JOB", "GAE_ENV", "FUNCTION_TARGET", "VERCEL", "AWS_LAMBDA_FUNCTION_NAME"] as const;

const read = (env: Env, name: string): string | undefined => {
  const v = env[name]?.trim().toLowerCase();
  return v === undefined || v === "" ? undefined : v;
};

function oneOf<const T extends string>(env: Env, name: string, allowed: readonly T[]): Result<T | undefined> {
  const v = read(env, name);
  if (v === undefined) return ok(undefined);
  const hit = allowed.find((a) => a === v);
  return hit === undefined ? err("invalid", `${name}=${env[name] ?? ""} is not one of ${allowed.join(", ")}; unset it or fix the spelling`, { detail: name }) : ok(hit);
}

export function localPostureOf(env: Env): Result<LocalPosture> {
  const o = oneOf(env, "LOCAL_BINARIES", ["on", "off"]);
  if (!o.ok) return o;
  if (o.value === "off") return ok("policy-forbidden");
  if (o.value === "on") return ok("available");
  return ok(MANAGED_MARKERS.some((m) => (env[m] ?? "") !== "") ? "managed-platform" : "available");
}

/** The sentence a trail entry carries for a blocked local binary (lib/deployment.ts describePosture). */
export function describeLocal(p: LocalPosture): string {
  switch (p) {
    case "available":
      return "this machine may spawn local binaries";
    case "policy-forbidden":
      return "LOCAL_BINARIES=off forbids spawning a local binary on this machine";
    case "managed-platform":
      return "this is a managed serverless platform, which has no local binary and no interactive login";
  }
}

export function derivePosture(env: Env): Result<Posture> {
  const local = localPostureOf(env);
  if (!local.ok) return local;
  const image = oneOf(env, "IMAGING_ENV", ["dev", "prod"]);
  if (!image.ok) return image;
  const text = oneOf(env, "TEXT_ENV", ["local", "cloud"]);
  if (!text.ok) return text;
  const retrieve = oneOf(env, "TEXT_RETRIEVE", ["1", "on", "true", "0", "off", "false"]);
  if (!retrieve.ok) return retrieve;
  const spawn = local.value === "available";
  return ok({
    plan: {
      image: image.value ?? (env["NODE_ENV"] === "production" ? "prod" : "dev"),
      text: text.value ?? (spawn ? "local" : "cloud"),
      // v1 HOSTED_CAPS switches music, SFX, local video and local renders off
      // together in a hosted deployment; a box that cannot spawn is that box.
      audio: spawn ? "local" : "hosted",
      video: spawn ? "local" : "hosted",
    },
    local: local.value,
    retrieval: retrieve.value === "1" || retrieve.value === "on" || retrieve.value === "true",
  });
}
