import type { z } from "zod";
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
export function parseAt<S extends z.ZodType>(
  door: string,
  schema: S,
  input: unknown,
): Result<Parsed<z.output<S>>> {
  const r = schema.safeParse(input);
  if (r.success) return ok(omitUndefined(r.data) as Parsed<z.output<S>>);
  return err("invalid", at(door, r.error.issues[0]), { detail: door });
}

/** The only JSON.parse allowed in packages; a syntax error is an `invalid` result. */
export function parseJsonAt<S extends z.ZodType>(
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
