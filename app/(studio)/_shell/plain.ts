// THE SHELL'S TWO SCHEMAS AND ITS JSON READER, WRITTEN BY HAND - and why they are not zod.
//
// `@gt/domain/door` reaches zod's core, and Turbopack ships the whole of that core (about 22 KB
// gzip, measured 2026-11-08, stock build) in the (studio) layout's chunk, so every route pays it
// for a one-key store and a two-field refusal body. A schema here is the part of one the store
// and the session bridge use: `safeParse` and its issues. The sentences are zod's own, so a
// refusal reads the same on screen and in a toast as before.

import { err, ok, type Result } from "@gt/domain/errors";
import type { Schema } from "@gt/ui/storage/store";

/** `parseJsonAt`'s first half: the only JSON.parse the shell needs; a syntax error is an `invalid` result. */
export function readJson(door: string, text: string): Result<unknown> {
  try {
    return ok(JSON.parse(text));
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "unparseable";
    return err("invalid", `${door}: not valid JSON: ${reason}`, { detail: door, cause });
  }
}

/** A refusal's body: app/_server/http.ts `envelope` - the sentence is `error`. */
export function readRefusal(body: string): Result<{ readonly error: string }> {
  const door = "session refusal";
  const json = readJson(door, body);
  if (!json.ok) return json;
  const r = refusalBody.safeParse(json.value);
  const issue = r.success ? undefined : r.error.issues[0];
  return r.success ? ok(r.data) : err("invalid", `${door}: ${issue?.path.join(".") || "(root)"}: ${issue?.message ?? "invalid input"}`, { detail: door });
}

const received = (v: unknown): string => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

/** `string().check(minLength(1))`. */
export const nonEmptyString: Schema<string> = {
  safeParse(input) {
    if (typeof input !== "string") return { success: false, error: { issues: [{ path: [], message: `Invalid input: expected string, received ${received(input)}` }] } };
    if (input.length < 1) return { success: false, error: { issues: [{ path: [], message: "Too small: expected string to have >=1 characters" }] } };
    return { success: true, data: input };
  },
};

/** `object({ error: string() })`: unknown keys are dropped, as zod's object does. */
export const refusalBody: Schema<{ readonly error: string }> = {
  safeParse(input) {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      return { success: false, error: { issues: [{ path: [], message: `Invalid input: expected object, received ${received(input)}` }] } };
    const error: unknown = Reflect.get(input, "error");
    if (typeof error !== "string") return { success: false, error: { issues: [{ path: ["error"], message: `Invalid input: expected string, received ${error === undefined ? "undefined" : received(error)}` }] } };
    return { success: true, data: { error } };
  },
};
