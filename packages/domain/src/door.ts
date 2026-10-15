import type { z } from "zod";
import { safeParse } from "zod/v4/core";
import { err, ok, type Result } from "./errors.ts";

type Flat<T> = { [K in keyof T]: T[K] };
type OptKeys<T> = {
  [K in keyof T]-?: Record<never, never> extends Pick<T, K> ? K : never;
}[keyof T];

/**
 * A parsed value as `exactOptionalPropertyTypes` sees it: an optional key is
 * absent, never present-as-undefined. `parseAt` guarantees this at runtime.
 */
export type Parsed<T> = T extends readonly unknown[]
  ? { [I in keyof T]: Parsed<T[I]> }
  : // A branded id is `string & $brand<B>`, which also extends `object`; without
    // this branch the brand is flattened away and `parseAt(...).id` stops being a ProjectId.
    T extends string | number | boolean | bigint | symbol
    ? T
    : T extends Date
    ? T
    : T extends object
      ? Flat<
          { [K in Exclude<keyof T, OptKeys<T>>]: Parsed<T[K]> } & {
            [K in OptKeys<T>]?: Parsed<Exclude<T[K], undefined>>;
          }
        >
      : T;

function isPlain(v: object): v is Record<string, unknown> {
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Drops keys whose value is undefined, deeply, so the output matches `Parsed`. */
function omitUndefined(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(omitUndefined);
  if (typeof v === "object" && v !== null && isPlain(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (x !== undefined) out[k] = omitUndefined(x);
    }
    return out;
  }
  return v;
}

function at(door: string, issue: z.core.$ZodIssue | undefined): string {
  if (!issue) return `${door}: invalid input`;
  const path =
    issue.path.length > 0 ? issue.path.map(String).join(".") : "(root)";
  return `${door}: ${path}: ${issue.message}`;
}

/** The schema door: the only way unknown data becomes a typed value. Never throws. */
//
// The bound is zod's CORE type, so a classic schema and a `zod/mini` one both pass:
// a client module builds its schemas from `zod/mini`, which tree-shakes, where one
// classic `z.string()` drags all of classic zod (~93 KB gzip, measured on /kit) into
// the first-load bundle. The kernel and the server keep classic zod.
export function parseAt<S extends z.core.$ZodType>(
  door: string,
  schema: S,
  input: unknown,
): Result<Parsed<z.output<S>>> {
  const r = safeParse(schema, input);
  if (r.success) return ok(omitUndefined(r.data) as Parsed<z.output<S>>);
  return err("invalid", at(door, r.error.issues[0]), { detail: door });
}

/** The only JSON.parse allowed in packages; a syntax error is an `invalid` result. */
export function parseJsonAt<S extends z.core.$ZodType>(
  door: string,
  schema: S,
  text: string,
): Result<Parsed<z.output<S>>> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "unparseable";
    return err("invalid", `${door}: not valid JSON: ${reason}`, {
      detail: door,
      cause,
    });
  }
  return parseAt(door, schema, raw);
}
