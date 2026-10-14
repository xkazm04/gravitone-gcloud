import { createHash } from "node:crypto";
import { AppError } from "@gt/domain/errors";

// CANONICAL JSON - the byte string a ledger hash is taken over.
//
// It is RFC 8785 (JSON Canonicalization Scheme), chosen because a second
// language must reproduce it byte for byte: packages/kernel/py/verify_events.py
// re-derives every hash with Python's stdlib alone. The scheme is:
//
//   - object keys sorted by UTF-16 code unit (JS's default sort; Python sorts
//     by code point, so the verifier sorts on the UTF-16-BE encoding instead -
//     the two differ only for keys holding characters beyond U+FFFF);
//   - no whitespace anywhere;
//   - strings escaped exactly as JSON.stringify escapes them (", \, the five
//     short escapes, other controls as lowercase \u00xx, nothing else), UTF-8;
//   - numbers in ECMAScript Number-to-String form. THIS is where Node and Python
//     disagree by default: Python prints 1.0 as "1.0", 1e-7 as "1e-07" and -0.0
//     as "-0.0"; ECMAScript prints "1", "1e-7" and "0". The verifier carries the
//     ECMAScript rendering, and both sides hash the same text.
//
// Refused, as `invalid`, rather than guessed at: non-finite numbers (JSON has
// none), lone surrogates (a string Python cannot encode as UTF-8), and anything
// that is not plain JSON data (undefined, functions, class instances).

export const GENESIS_HASH = "0".repeat(64);

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function isPlainObject(v: object): v is Record<string, unknown> {
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

// With the u flag a surrogate PAIR is one code point, so \p{Cs} meets only a lone half.
const LONE_SURROGATE = /\p{Cs}/u;

function str(s: string, at: string): string {
  if (LONE_SURROGATE.test(s)) throw new AppError("invalid", `canonical: ${at} holds a lone surrogate`);
  return JSON.stringify(s);
}

function enc(v: unknown, at: string): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new AppError("invalid", `canonical: ${at} is not a finite number`);
    // ECMAScript Number::toString; JSON.stringify(-0) is "0", as RFC 8785 wants.
    return JSON.stringify(v);
  }
  if (typeof v === "string") return str(v, at);
  if (Array.isArray(v)) return `[${v.map((x, i) => enc(x, `${at}[${i}]`)).join(",")}]`;
  if (typeof v === "object" && isPlainObject(v)) {
    const keys = Object.keys(v).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const x = v[k];
      if (x === undefined) throw new AppError("invalid", `canonical: ${at}.${k} is undefined; absent keys are omitted`);
      parts.push(`${str(k, `${at} key`)}:${enc(x, `${at}.${k}`)}`);
    }
    return `{${parts.join(",")}}`;
  }
  throw new AppError("invalid", `canonical: ${at} is not JSON data (${typeof v})`);
}

/** RFC 8785 canonical JSON. Throws `AppError("invalid")` on anything that is not plain JSON. */
export function canonical(v: unknown): string {
  return enc(v, "$");
}

/** One link of the ledger chain: sha256 over the previous hash followed by
 *  the canonical form of the row without its own hash. */
export function chainHash(prevHash: string, body: unknown): string {
  return sha256Hex(prevHash + canonical(body));
}
