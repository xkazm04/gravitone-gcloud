/**
 * The closed error taxonomy. Callers never need another error class; a new
 * failure is classified into one of these codes.
 */
export type AppErrorCode =
  /** input failed a schema door; forms and CLIs show field-level detail. */
  | "invalid"
  /** the addressed record does not exist; routes answer 404 and pages render notFound. */
  | "not-found"
  /** the write lost a race or violates uniqueness; clients refetch and retry. */
  | "conflict"
  /** no credential, or an expired one; the client signs in again. */
  | "unauthenticated"
  /** the operation is not permitted in the current state (transitions, auth); UI disables the action. */
  | "refused"
  /** a dependency (provider, disk, network) is down; retry-with-backoff loops branch on it. */
  | "unavailable"
  /** a spend or quota limit stops the run; the budget gate and cost UI branch on it. */
  | "budget"
  /** a bug or unclassified failure; the only code that is logged as a defect. */
  | "internal";

export type ErrorOptions2 = { detail?: string; cause?: unknown };

export class AppError extends Error {
  readonly code: AppErrorCode;
  declare readonly detail?: string;

  constructor(code: AppErrorCode, message: string, options?: ErrorOptions2) {
    super(message, options !== undefined && "cause" in options ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    if (options?.detail !== undefined) this.detail = options.detail;
  }
}

/**
 * The class's brand, registered in the runtime-wide symbol registry so every copy of this
 * module answers to the same key. `instanceof` is identity of ONE constructor, and a process
 * routinely holds two: a Next route graph beside the page graph that opened the cached kernel
 * store (lib/kernelStore.ts), a tsx CLI's static graph beside the one pipeline/lib-hooks.mts
 * loads the producers through. An AppError thrown by one copy failed the other's `instanceof`,
 * and kernel/store `classify` re-labelled `not-found` as `internal` - three same-job proofs red
 * (L44, tests/next-server/exit-store-classify.test.ts). The brand lives on the prototype, so no
 * instance grows a field and equality of two errors is unchanged.
 */
const BRAND: unique symbol = Symbol.for("gt.AppError");
Object.defineProperty(AppError.prototype, BRAND, { value: true });

/**
 * Is this an AppError from ANY copy of this module? The only test the codebase uses in place of
 * `instanceof AppError`: a branded Error whose `code` is in the taxonomy. A look-alike without the
 * brand (an Error that merely carries a `code`) is not one - a Node `ENOENT` is not `not-found`.
 */
export function isAppError(e: unknown): e is AppError {
  if (e instanceof AppError) return true;
  if (!(e instanceof Error) || Reflect.get(e, BRAND) !== true) return false;
  const code: unknown = Reflect.get(e, "code");
  // STATUS is the exhaustive record over the taxonomy, so a new code is recognised here for free.
  return typeof code === "string" && Object.hasOwn(STATUS, code);
}

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: AppError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T = never>(code: AppErrorCode, message: string, options?: ErrorOptions2): Result<T> {
  return { ok: false, error: new AppError(code, message, options) };
}

export function isOk<T>(r: Result<T>): r is { readonly ok: true; readonly value: T } {
  return r.ok;
}

export type ErrorEnvelope = { error: string; code: AppErrorCode; detail?: string };

export function toEnvelope(e: AppError): ErrorEnvelope {
  const env: ErrorEnvelope = { error: e.message, code: e.code };
  if (e.detail !== undefined) env.detail = e.detail;
  return env;
}

const STATUS: Readonly<Record<AppErrorCode, number>> = {
  invalid: 400,
  "not-found": 404,
  conflict: 409,
  unauthenticated: 401,
  refused: 403,
  unavailable: 503,
  budget: 402,
  internal: 500,
};

export function httpStatus(code: AppErrorCode): number {
  return STATUS[code];
}
